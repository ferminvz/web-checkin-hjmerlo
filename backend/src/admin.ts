/**
 * Helper para administración - crear tokens de prueba, etc.
 *
 * Endpoints admin (solo para desarrollo):
 * - POST /admin/create-session
 */

import type { Env, CheckinSession } from './types'

export async function handleCreateSession(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{
    reservationCode?: string
    guestName?: string
    guestDni?: string
    checkInDate?: string
    checkOutDate?: string
    expiresInHours?: number
  }>()

  // Generar token único
  const token = crypto.randomUUID()
  const sessionId = crypto.randomUUID()

  // Datos por defecto para testing
  const session: CheckinSession = {
    sessionId,
    reservationCode: body.reservationCode || 'TEST2024',
    guestName: body.guestName || 'Vazquez, Fermin',
    guestDni: body.guestDni || '30627652',
    checkInDate: body.checkInDate || new Date().toISOString().split('T')[0],
    checkOutDate: body.checkOutDate || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + (body.expiresInHours || 24) * 60 * 60 * 1000
  }

  // Guardar en KV
  await env.CHECKIN_DATA.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: (body.expiresInHours || 24) * 60 * 60
  })

  return new Response(JSON.stringify({
    success: true,
    token,
    session,
    url: `http://localhost:3000/${token}`,
    productionUrl: `https://checkin.howardjohnsonmerlo.com/${token}`
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
