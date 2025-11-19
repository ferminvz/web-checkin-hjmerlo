/**
 * FileMaker Data API Integration
 * Docs: https://help.claris.com/en/data-api-guide/
 */

import type { Env, CheckinData } from './types'

interface FileMakerAuthResponse {
  response: {
    token: string
  }
  messages: Array<{ code: string; message: string }>
}

interface FileMakerCreateResponse {
  response: {
    recordId: string
    modId: string
  }
  messages: Array<{ code: string; message: string }>
}

/**
 * Obtiene un token de autenticación de FileMaker Data API
 */
export async function getFileMakerToken(env: Env): Promise<string> {
  const authUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/sessions`

  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${env.FILEMAKER_USERNAME}:${env.FILEMAKER_PASSWORD}`)
    }
  })

  if (!response.ok) {
    throw new Error(`FileMaker auth failed: ${response.statusText}`)
  }

  const data: FileMakerAuthResponse = await response.json()
  return data.response.token
}

/**
 * Cierra una sesión de FileMaker Data API
 */
export async function closeFileMakerSession(env: Env, token: string): Promise<void> {
  const url = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/sessions/${token}`

  await fetch(url, {
    method: 'DELETE'
  })
}

/**
 * Sincroniza un check-in completo a FileMaker (múltiples guests)
 * Crea registros en WEB_guest_documents y actualiza WEB_checkin_sessions
 */
export async function syncCheckinToFileMaker(
  checkinData: CheckinData,
  env: Env
): Promise<{ success: boolean; recordIds?: string[]; error?: string }> {
  let token: string | null = null

  try {
    // 1. Autenticar
    token = await getFileMakerToken(env)
    console.log('FileMaker: authenticated')

    const documentRecordIds: string[] = []

    // 2. Crear un registro en WEB_guest_documents por cada guest
    const createDocUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/layouts/${env.FILEMAKER_LAYOUT_DOCUMENTS}/records`

    for (const guest of checkinData.guests) {
      const fieldData: Record<string, any> = {
        'id_session': checkinData.sessionId,
        'guest_type': guest.guestType,
        'order': guest.order,
        'dni_number': guest.dni,
        'document_type': 'DNI',
        'first_name': guest.firstName,
        'last_name': guest.lastName,
        'email': guest.email || '',
        'phone': guest.phone || '',
        'address': guest.address || '',
        'whatsapp_number': guest.whatsappNumber || '',
        'whatsapp_validated': guest.whatsappValidated ? 1 : 0,
        'r2_front_key': guest.frontImageKey,
        'r2_back_key': guest.backImageKey,
        'r2_signature_key': guest.signatureKey,
        'pdf417_parsed_successfully': 0,
        'ocr_fallback_used': 0,
        'upload_count': 1,
        'status': 'Verified',
        'created_at': guest.submittedAt
      }

      // Solo agregar birth_date si existe
      if (guest.birthDate) {
        fieldData['birth_date'] = guest.birthDate
      }

      const documentData = { fieldData }

      // Crear registro
      const createDocResponse = await fetch(createDocUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(documentData)
      })

      if (!createDocResponse.ok) {
        const errorText = await createDocResponse.text()
        throw new Error(`FileMaker create document failed for guest ${guest.order}: ${errorText}`)
      }

      const createDocData: FileMakerCreateResponse = await createDocResponse.json()
      const documentRecordId = createDocData.response.recordId
      documentRecordIds.push(documentRecordId)
      console.log(`FileMaker: WEB_guest_documents created for guest ${guest.order}:`, documentRecordId)
    }

    // 4. Buscar la sesión en WEB_checkin_sessions por sessionId
    const findSessionUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/layouts/${env.FILEMAKER_LAYOUT_SESSIONS}/_find`

    const findSessionResponse = await fetch(findSessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: [{
          'id_session': checkinData.sessionId
        }]
      })
    })

    if (findSessionResponse.ok) {
      const findData: any = await findSessionResponse.json()

      if (findData.response.data && findData.response.data.length > 0) {
        const sessionRecordId = findData.response.data[0].recordId

        // 3. Actualizar WEB_checkin_sessions
        const updateSessionUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/layouts/${env.FILEMAKER_LAYOUT_SESSIONS}/records/${sessionRecordId}`

        await fetch(updateSessionUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            fieldData: {
              'completed_guests': checkinData.completedGuests,
              'completed': checkinData.completedGuests >= checkinData.totalGuests ? 1 : 0,
              'completed_at': checkinData.submittedAt
            }
          })
        })

        console.log('FileMaker: WEB_checkin_sessions updated', sessionRecordId)
      }
    }

    return {
      success: true,
      recordIds: documentRecordIds
    }

  } catch (error) {
    console.error('FileMaker sync error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }

  } finally {
    // Cerrar sesión
    if (token) {
      await closeFileMakerSession(env, token)
    }
  }
}

/**
 * Sincroniza múltiples check-ins a FileMaker
 */
export async function syncPendingCheckinsToFileMaker(env: Env): Promise<{
  processed: number
  synced: number
  failed: number
  errors: string[]
}> {
  const stats = {
    processed: 0,
    synced: 0,
    failed: 0,
    errors: [] as string[]
  }

  try {
    // 1. Listar todos los check-ins en KV
    const list = await env.CHECKIN_DATA.list({ prefix: 'checkin:' })

    console.log(`Found ${list.keys.length} check-ins in KV`)

    // 2. Procesar cada check-in
    for (const key of list.keys) {
      stats.processed++

      try {
        const checkinStr = await env.CHECKIN_DATA.get(key.name)
        if (!checkinStr) continue

        const checkinData: CheckinData = JSON.parse(checkinStr)

        // Skip si ya está sincronizado
        if (checkinData.syncedToFileMaker) {
          console.log(`Skipping ${key.name} - already synced`)
          continue
        }

        // Sincronizar a FileMaker
        const result = await syncCheckinToFileMaker(checkinData, env)

        if (result.success) {
          stats.synced++

          // Marcar como sincronizado en KV
          checkinData.syncedToFileMaker = true
          await env.CHECKIN_DATA.put(key.name, JSON.stringify(checkinData))

          console.log(`Synced ${key.name} to FileMaker (recordId: ${result.recordId})`)
        } else {
          stats.failed++
          stats.errors.push(`${key.name}: ${result.error}`)
        }

      } catch (error) {
        stats.failed++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        stats.errors.push(`${key.name}: ${errorMsg}`)
        console.error(`Error processing ${key.name}:`, error)
      }

      // Rate limiting: esperar 100ms entre requests
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('Sync completed:', stats)
    return stats

  } catch (error) {
    console.error('Sync batch error:', error)
    throw error
  }
}
