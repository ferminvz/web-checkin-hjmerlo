/**
 * Web Check-in API Worker
 *
 * Endpoints:
 * - POST /api/web-checkin/validate-token/{token}
 * - POST /api/web-checkin/check-duplicate
 * - POST /api/web-checkin/submit
 * - GET /api/web-checkin/document/{dni}/{type}
 */

import type {
  Env,
  SubmitCheckinRequest,
  ValidateTokenResponse,
  CheckDuplicateResponse,
  SubmitCheckinResponse,
  CheckinSession,
  CheckinData,
  QueueMessage
} from './types'
import { handleCreateSession } from './admin'
import { syncPendingCheckinsToFileMaker } from './filemaker'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // Handle OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // Admin endpoints (solo desarrollo/testing)
      if (path === '/admin/create-session' && request.method === 'POST') {
        return handleCreateSession(request, env)
      }

      if (path === '/admin/sync-filemaker' && request.method === 'POST') {
        const stats = await syncPendingCheckinsToFileMaker(env)
        return jsonResponse({
          success: true,
          message: 'Sync completed',
          stats
        }, 200, corsHeaders)
      }

      // Endpoint para FileMaker - crear sesión de check-in
      if (path === '/api/web-checkin/create-session' && request.method === 'POST') {
        return handleCreateSessionFromFileMaker(request, env, corsHeaders)
      }

      // Router
      if (path.match(/^\/api\/web-checkin\/validate-token\/.+$/)) {
        return handleValidateToken(request, env, corsHeaders)
      }

      if (path === '/api/web-checkin/check-duplicate') {
        return handleCheckDuplicate(request, env, corsHeaders)
      }

      if (path === '/api/web-checkin/submit') {
        return handleSubmit(request, env, ctx, corsHeaders)
      }

      if (path === '/api/web-checkin/submit-guest') {
        return handleSubmitGuest(request, env, ctx, corsHeaders)
      }

      if (path.match(/^\/api\/web-checkin\/document\/.+\/.+$/)) {
        return handleGetDocument(request, env, corsHeaders)
      }

      // 404
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders)

    } catch (error) {
      console.error('Error processing request:', error)
      return jsonResponse(
        { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
        500,
        corsHeaders
      )
    }
  },

  /**
   * Queue consumer para sincronización a FileMaker
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    console.log(`Processing ${batch.messages.length} check-ins for FileMaker sync`)

    for (const message of batch.messages) {
      try {
        const { checkinId, dni } = message.body

        // Obtener datos del check-in de KV
        const checkinDataStr = await env.CHECKIN_DATA.get(`checkin:${checkinId}`)
        if (!checkinDataStr) {
          console.warn(`Check-in ${checkinId} not found in KV`)
          message.ack()
          continue
        }

        const checkinData: CheckinData = JSON.parse(checkinDataStr)

        // TODO: Sincronizar a FileMaker
        // await syncToFileMaker(checkinData, env)

        // Marcar como sincronizado
        checkinData.syncedToFileMaker = true
        await env.CHECKIN_DATA.put(`checkin:${checkinId}`, JSON.stringify(checkinData))

        console.log(`Check-in ${checkinId} synced to FileMaker`)
        message.ack()

      } catch (error) {
        console.error(`Error processing message:`, error)
        message.retry()
      }
    }
  },

  /**
   * Scheduled handler - se ejecuta cada 5 minutos vía Cron Trigger
   * Sincroniza check-ins pendientes a FileMaker
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered at:', new Date(event.scheduledTime).toISOString())

    try {
      const stats = await syncPendingCheckinsToFileMaker(env)

      console.log('Sync stats:', {
        processed: stats.processed,
        synced: stats.synced,
        failed: stats.failed,
        errors: stats.errors.length > 0 ? stats.errors : 'none'
      })

    } catch (error) {
      console.error('Cron sync error:', error)
    }
  }
}

/**
 * POST /api/web-checkin/create-session
 * Crea una sesión de check-in desde FileMaker
 * Request body: { id_session, reservation_code, guest_name, guest_dni, check_in_date, check_out_date }
 */
async function handleCreateSessionFromFileMaker(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json<{
      id_session: string | number
      reservation_code: string
      guest_name: string
      guest_dni: string
      check_in_date: string
      check_out_date: string
      email?: string
      total_guests?: number
    }>()

    // Validar datos requeridos
    if (!body.id_session || !body.reservation_code || !body.guest_name || !body.guest_dni) {
      return jsonResponse({
        error: 'Datos incompletos',
        required: ['id_session', 'reservation_code', 'guest_name', 'guest_dni']
      }, 400, corsHeaders)
    }

    // Generar token único
    const token = crypto.randomUUID()

    // Crear sesión
    const session: CheckinSession = {
      sessionId: body.id_session.toString(),
      reservationCode: body.reservation_code,
      guestName: body.guest_name,
      guestDni: body.guest_dni,
      checkInDate: body.check_in_date || new Date().toISOString().split('T')[0],
      checkOutDate: body.check_out_date || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      totalGuests: body.total_guests || 1,
      completedGuests: 0,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 72 * 60 * 60 * 1000  // 72 horas
    }

    // Guardar en KV (expira en 72 horas)
    await env.CHECKIN_DATA.put(`session:${token}`, JSON.stringify(session), {
      expirationTtl: 72 * 60 * 60
    })

    // Guardar también en WEB_checkin_sessions de FileMaker
    await updateFileMakerSession(env, body.id_session.toString(), token)

    return jsonResponse({
      success: true,
      token,
      session,
      link: `https://checkin.hjmerlo.fun/${token}`,
      expires_at: new Date(session.expiresAt).toISOString()
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Error creating session:', error)
    return jsonResponse({
      error: 'Error al crear sesión',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500, corsHeaders)
  }
}

/**
 * Actualiza el token en WEB_checkin_sessions de FileMaker
 */
async function updateFileMakerSession(env: Env, sessionId: string, token: string): Promise<void> {
  let fmToken: string | null = null

  try {
    // Auth
    fmToken = await getFileMakerToken(env)

    // Buscar la sesión
    const findUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/layouts/${env.FILEMAKER_LAYOUT_SESSIONS}/_find`

    const findResponse = await fetch(findUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fmToken}`
      },
      body: JSON.stringify({
        query: [{ 'id_session': sessionId }]
      })
    })

    if (findResponse.ok) {
      const findData: any = await findResponse.json()

      if (findData.response.data && findData.response.data.length > 0) {
        const recordId = findData.response.data[0].recordId

        // Actualizar con el token
        const updateUrl = `https://${env.FILEMAKER_HOST}/fmi/data/v1/databases/${env.FILEMAKER_DATABASE}/layouts/${env.FILEMAKER_LAYOUT_SESSIONS}/records/${recordId}`

        await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${fmToken}`
          },
          body: JSON.stringify({
            fieldData: {
              'unique_token': token,
              'link_sent_date': new Date().toISOString()
            }
          })
        })
      }
    }

  } catch (error) {
    console.error('Error updating FileMaker session:', error)
  } finally {
    if (fmToken) {
      await closeFileMakerSession(env, fmToken)
    }
  }
}

// Import FileMaker functions
import { getFileMakerToken, closeFileMakerSession } from './filemaker'

/**
 * POST /api/web-checkin/validate-token/{token}
 * Valida un token y retorna información de la sesión
 */
async function handleValidateToken(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url)
  const token = url.pathname.split('/').pop()

  if (!token) {
    return jsonResponse({ error: 'Token no proporcionado' }, 400, corsHeaders)
  }

  // Buscar sesión en KV
  const sessionStr = await env.CHECKIN_DATA.get(`session:${token}`)

  if (!sessionStr) {
    return jsonResponse({ error: 'Token inválido o expirado' }, 401, corsHeaders)
  }

  const session: CheckinSession = JSON.parse(sessionStr)

  // Verificar expiración
  if (Date.now() > session.expiresAt) {
    await env.CHECKIN_DATA.delete(`session:${token}`)
    return jsonResponse({ error: 'Token expirado' }, 401, corsHeaders)
  }

  const response: ValidateTokenResponse = {
    sessionId: session.sessionId,
    reservationCode: session.reservationCode,
    guestName: session.guestName,
    guestDni: session.guestDni,
    checkInDate: session.checkInDate,
    checkOutDate: session.checkOutDate,
    totalGuests: session.totalGuests,
    completedGuests: session.completedGuests
  }

  return jsonResponse(response, 200, corsHeaders)
}

/**
 * POST /api/web-checkin/check-duplicate
 * Verifica si un DNI ya existe
 */
async function handleCheckDuplicate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { dni } = await request.json<{ dni: string }>()

  if (!dni) {
    return jsonResponse({ error: 'DNI no proporcionado' }, 400, corsHeaders)
  }

  // Buscar en KV si existe un check-in previo con este DNI
  const existingStr = await env.CHECKIN_DATA.get(`dni:${dni}`)

  const response: CheckDuplicateResponse = {
    exists: !!existingStr,
    document: existingStr ? JSON.parse(existingStr) : undefined
  }

  return jsonResponse(response, 200, corsHeaders)
}

/**
 * POST /api/web-checkin/submit
 * Procesa y guarda un check-in completo
 */
async function handleSubmit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const data: SubmitCheckinRequest = await request.json()

  // Validar datos requeridos
  if (!data.token || !data.dni || !data.firstName || !data.lastName || !data.email) {
    return jsonResponse({ error: 'Datos incompletos' }, 400, corsHeaders)
  }

  if (!data.frontImage || !data.backImage || !data.signature) {
    return jsonResponse({ error: 'Faltan imágenes requeridas' }, 400, corsHeaders)
  }

  // Validar token
  const sessionStr = await env.CHECKIN_DATA.get(`session:${data.token}`)
  if (!sessionStr) {
    return jsonResponse({ error: 'Token inválido' }, 401, corsHeaders)
  }

  const session: CheckinSession = JSON.parse(sessionStr)

  // Generar ID único para este check-in
  const checkinId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  // Guardar imágenes en R2
  const frontKey = `${checkinId}_front.jpg`
  const backKey = `${checkinId}_back.jpg`
  const signatureKey = `${checkinId}_signature.png`

  try {
    // Convertir base64 a buffer y guardar en R2
    await saveBase64ToR2(env.STORAGE, frontKey, data.frontImage, 'image/jpeg')
    await saveBase64ToR2(env.STORAGE, backKey, data.backImage, 'image/jpeg')
    await saveBase64ToR2(env.STORAGE, signatureKey, data.signature, 'image/png')

    // Crear objeto de datos del check-in
    const checkinData: CheckinData = {
      sessionId: session.sessionId,
      dni: data.dni,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      birthDate: data.birthDate,
      frontImageKey: frontKey,
      backImageKey: backKey,
      signatureKey: signatureKey,
      submittedAt: timestamp,
      syncedToFileMaker: false
    }

    // Guardar en KV
    await env.CHECKIN_DATA.put(`checkin:${checkinId}`, JSON.stringify(checkinData))
    await env.CHECKIN_DATA.put(`dni:${data.dni}`, JSON.stringify({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      uploadCount: 1,
      lastVerified: timestamp
    }))

    // Enviar a Queue para sincronización a FileMaker (si está disponible)
    if (env.CHECKIN_QUEUE) {
      await env.CHECKIN_QUEUE.send({
        checkinId,
        dni: data.dni,
        timestamp
      })
    } else {
      console.log('Queue not available - check-in saved in KV/R2 only')
    }

    const response: SubmitCheckinResponse = {
      success: true,
      documentId: checkinId,
      r2Keys: {
        frontKey,
        backKey,
        signatureKey
      }
    }

    return jsonResponse(response, 200, corsHeaders)

  } catch (error) {
    console.error('Error saving check-in:', error)
    return jsonResponse(
      { error: 'Error al guardar check-in', message: error instanceof Error ? error.message : 'Unknown' },
      500,
      corsHeaders
    )
  }
}

/**
 * POST /api/web-checkin/submit-guest
 * Procesa y guarda un guest individual (titular o acompañante)
 */
async function handleSubmitGuest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const data: SubmitGuestRequest = await request.json()

  // Validar datos requeridos
  if (!data.token || !data.dni || !data.firstName || !data.lastName) {
    return jsonResponse({ error: 'Datos incompletos' }, 400, corsHeaders)
  }

  if (!data.frontImage || !data.backImage || !data.signature) {
    return jsonResponse({ error: 'Faltan imágenes requeridas' }, 400, corsHeaders)
  }

  // Validar token y obtener sesión
  const sessionStr = await env.CHECKIN_DATA.get(`session:${data.token}`)
  if (!sessionStr) {
    return jsonResponse({ error: 'Token inválido' }, 401, corsHeaders)
  }

  const session: CheckinSession = JSON.parse(sessionStr)

  // Generar ID único para este documento
  const documentId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  // Guardar imágenes en R2
  const frontKey = `${session.sessionId}_${data.order}_front.jpg`
  const backKey = `${session.sessionId}_${data.order}_back.jpg`
  const signatureKey = `${session.sessionId}_${data.order}_signature.png`

  try {
    // Convertir base64 a buffer y guardar en R2
    await saveBase64ToR2(env.STORAGE, frontKey, data.frontImage, 'image/jpeg')
    await saveBase64ToR2(env.STORAGE, backKey, data.backImage, 'image/jpeg')
    await saveBase64ToR2(env.STORAGE, signatureKey, data.signature, 'image/png')

    // Crear objeto de datos del guest
    const guestDocument: GuestDocument = {
      sessionId: session.sessionId,
      guestType: data.guestType,
      order: data.order,
      dni: data.dni,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || '',
      phone: data.phone,
      birthDate: data.birthDate,
      address: data.address,
      whatsappNumber: data.whatsappNumber,
      whatsappValidated: data.whatsappValidated || false,
      frontImageKey: frontKey,
      backImageKey: backKey,
      signatureKey: signatureKey,
      submittedAt: timestamp
    }

    // Guardar documento del guest en KV
    await env.CHECKIN_DATA.put(`guest:${documentId}`, JSON.stringify(guestDocument))

    // Guardar mapeo DNI → sessionId + order para recuperar imágenes
    await env.CHECKIN_DATA.put(`dni:${data.dni}`, JSON.stringify({
      sessionId: session.sessionId,
      order: data.order
    }), {
      expirationTtl: 72 * 60 * 60
    })

    // Obtener o crear el CheckinData general
    const checkinKey = `checkin:${session.sessionId}`
    let checkinData: CheckinData

    const existingCheckinStr = await env.CHECKIN_DATA.get(checkinKey)
    if (existingCheckinStr) {
      checkinData = JSON.parse(existingCheckinStr)
      checkinData.guests.push(guestDocument)
      checkinData.completedGuests = checkinData.guests.length
    } else {
      checkinData = {
        sessionId: session.sessionId,
        totalGuests: session.totalGuests,
        completedGuests: 1,
        guests: [guestDocument],
        syncedToFileMaker: false,
        submittedAt: timestamp
      }
    }

    // Guardar CheckinData actualizado
    await env.CHECKIN_DATA.put(checkinKey, JSON.stringify(checkinData))

    // Actualizar la sesión con el contador
    session.completedGuests = checkinData.completedGuests
    await env.CHECKIN_DATA.put(`session:${data.token}`, JSON.stringify(session), {
      expirationTtl: 72 * 60 * 60
    })

    // Si todos completaron, enviar a Queue (si está disponible)
    const allCompleted = checkinData.completedGuests >= checkinData.totalGuests
    if (allCompleted && env.CHECKIN_QUEUE) {
      await env.CHECKIN_QUEUE.send({
        checkinId: session.sessionId,
        dni: data.dni,
        timestamp
      })
    }

    return jsonResponse({
      success: true,
      documentId,
      guestNumber: data.order,
      totalGuests: checkinData.totalGuests,
      completedGuests: checkinData.completedGuests,
      allCompleted,
      r2Keys: {
        frontKey,
        backKey,
        signatureKey
      }
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Error saving guest:', error)
    return jsonResponse(
      { error: 'Error al guardar guest', message: error instanceof Error ? error.message : 'Unknown' },
      500,
      corsHeaders
    )
  }
}

/**
 * GET /api/web-checkin/document/{dni}/{type}
 * Obtiene una imagen de documento
 */
async function handleGetDocument(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const dni = parts[parts.length - 2]
  const type = parts[parts.length - 1] as 'front' | 'back' | 'signature'

  if (!dni || !type) {
    return jsonResponse({ error: 'Parámetros inválidos' }, 400, corsHeaders)
  }

  // Buscar el mapeo DNI → sessionId + order
  const dniMappingStr = await env.CHECKIN_DATA.get(`dni:${dni}`)
  if (!dniMappingStr) {
    return jsonResponse({ error: 'Documento no encontrado' }, 404, corsHeaders)
  }

  const dniMapping: { sessionId: string; order: number } = JSON.parse(dniMappingStr)

  // Construir la key del R2 basada en sessionId + order
  const extension = type === 'signature' ? 'png' : 'jpg'
  const key = `${dniMapping.sessionId}_${dniMapping.order}_${type}.${extension}`

  const object = await env.STORAGE.get(key)

  if (!object) {
    return jsonResponse({ error: 'Imagen no encontrada en R2', key }, 404, corsHeaders)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      ...corsHeaders
    }
  })
}

/**
 * Helpers
 */

function jsonResponse(data: any, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })
}

async function saveBase64ToR2(
  bucket: R2Bucket,
  key: string,
  base64Data: string,
  contentType: string
): Promise<void> {
  // Remover el prefijo data:image/...;base64, si existe
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')

  // Convertir base64 a ArrayBuffer
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType
    }
  })
}
