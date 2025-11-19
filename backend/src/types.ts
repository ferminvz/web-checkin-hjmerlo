/**
 * Tipos para el Worker de Web Check-in
 */

export interface Env {
  STORAGE: R2Bucket
  CHECKIN_DATA: KVNamespace
  CHECKIN_QUEUE?: Queue  // Opcional - requiere plan paid
  ENVIRONMENT: string

  // FileMaker Data API
  FILEMAKER_HOST: string
  FILEMAKER_DATABASE: string
  FILEMAKER_LAYOUT_DOCUMENTS: string
  FILEMAKER_LAYOUT_SESSIONS: string
  FILEMAKER_USERNAME: string
  FILEMAKER_PASSWORD: string
}

export interface CheckinSession {
  sessionId: string
  reservationCode: string
  guestName: string
  guestDni: string
  checkInDate: string
  checkOutDate: string
  totalGuests: number
  completedGuests: number
  createdAt: string
  expiresAt: number
}

export interface GuestDocument {
  sessionId: string
  guestType: 'Titular' | 'Acompañante'
  order: number  // 1=titular, 2=acompañante1, etc.
  dni: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  birthDate?: string
  address?: string
  whatsappNumber?: string
  whatsappValidated?: boolean
  frontImageKey: string
  backImageKey: string
  signatureKey: string
  submittedAt: string
}

export interface CheckinData {
  sessionId: string
  totalGuests: number
  completedGuests: number
  guests: GuestDocument[]
  syncedToFileMaker: boolean
  submittedAt: string
}

export interface SubmitGuestRequest {
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

export interface SubmitCheckinRequest {
  token: string
  totalGuests: number
  guests: SubmitGuestRequest[]
}

export interface ValidateTokenResponse {
  sessionId: string
  reservationCode: string
  guestName: string  // Titular
  guestDni: string   // Titular
  checkInDate: string
  checkOutDate: string
  totalGuests: number  // Total de personas en la reserva
  completedGuests: number  // Cuántos ya completaron check-in
}

export interface CheckDuplicateResponse {
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

export interface SubmitCheckinResponse {
  success: boolean
  documentId: string
  r2Keys: {
    frontKey: string
    backKey: string
    signatureKey: string
  }
}

export interface QueueMessage {
  checkinId: string
  dni: string
  timestamp: string
}
