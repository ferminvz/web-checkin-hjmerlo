/**
 * API Client para Web Check-in Worker
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://web-checkin-api.fvazquez-2f3.workers.dev'

export interface ValidateTokenResponse {
  sessionId: string
  reservationCode: string
  guestName: string
  guestDni: string
  checkInDate: string
  checkOutDate: string
  totalGuests: number
  completedGuests: number
}

export interface CheckDuplicateResponse {
  success: boolean
  exists: boolean
  document?: {
    firstName: string
    lastName: string
    email: string
    phone: string
    uploadCount: number
    lastVerified: string
  }
}

export interface SubmitGuestData {
  token: string
  guestType: 'Titular' | 'Acompañante'
  order: number
  dni: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  birthDate?: string
  address?: string
  whatsappNumber?: string
  whatsappValidated?: boolean
  frontImage: string  // base64
  backImage: string   // base64
  signature: string   // base64
}

export interface SubmitGuestResponse {
  success: boolean
  documentId: string
  guestNumber: number
  totalGuests: number
  completedGuests: number
  allCompleted: boolean
  r2Keys: {
    frontKey: string
    backKey: string
    signatureKey: string
  }
}

// Legacy - mantener para compatibilidad
export interface SubmitCheckinData extends SubmitGuestData {}
export interface SubmitCheckinResponse extends SubmitGuestResponse {
  reused?: boolean
}

/**
 * Validar token de web check-in
 */
export async function validateToken(token: string): Promise<ValidateTokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/web-checkin/validate-token/${token}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token inválido' }))
    throw new Error(error.error || 'Token inválido o expirado')
  }

  return response.json()
}

/**
 * Verificar si DNI ya existe
 */
export async function checkDuplicate(dni: string): Promise<CheckDuplicateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/web-checkin/check-duplicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dni }),
  })

  if (!response.ok) {
    throw new Error('Error al verificar DNI')
  }

  return response.json()
}

/**
 * Enviar datos de un guest individual (titular o acompañante)
 */
export async function submitGuest(data: SubmitGuestData): Promise<SubmitGuestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/web-checkin/submit-guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error al enviar' }))
    throw new Error(error.error || 'Error al completar check-in')
  }

  return response.json()
}

/**
 * Enviar check-in completo (legacy - usa submitGuest internamente)
 */
export async function submitCheckin(data: SubmitCheckinData): Promise<SubmitCheckinResponse> {
  return submitGuest(data)
}

/**
 * Obtener URL de imagen de documento
 */
export function getDocumentImageUrl(dni: string, type: 'front' | 'back' | 'signature'): string {
  return `${API_BASE_URL}/api/web-checkin/document/${dni}/${type}`
}
