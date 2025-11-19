# Web Check-in API Worker

Worker API para el sistema de web check-in de Howard Johnson Merlo.

## 🏗️ Arquitectura

```
Frontend (Next.js) → Worker API → KV + R2 → Queue → FileMaker
```

**Flujo:**
1. Frontend envía check-in al Worker
2. Worker guarda inmediatamente en KV (datos) + R2 (imágenes)
3. Worker responde "success" al usuario (respuesta rápida)
4. Worker envía mensaje a Queue para procesamiento
5. Queue Consumer sincroniza a FileMaker en background

## 📡 Endpoints

### `POST /api/web-checkin/validate-token/{token}`
Valida un token de sesión y retorna información de la reserva.

**Response:**
```json
{
  "sessionId": "uuid",
  "reservationCode": "ABC123",
  "guestName": "Vazquez, Fermin",
  "guestDni": "30627652",
  "checkInDate": "2024-12-20",
  "checkOutDate": "2024-12-25"
}
```

### `POST /api/web-checkin/check-duplicate`
Verifica si un DNI ya tiene un check-in previo.

**Request:**
```json
{
  "dni": "30627652"
}
```

**Response:**
```json
{
  "exists": false
}
```

### `POST /api/web-checkin/submit`
Procesa y guarda un check-in completo.

**Request:**
```json
{
  "token": "session-token",
  "dni": "30627652",
  "firstName": "Fermin",
  "lastName": "Vazquez",
  "email": "email@example.com",
  "phone": "+549123456789",
  "birthDate": "1984-03-06",
  "frontImage": "data:image/jpeg;base64,...",
  "backImage": "data:image/jpeg;base64,...",
  "signature": "data:image/png;base64,..."
}
```

**Response:**
```json
{
  "success": true,
  "documentId": "uuid",
  "r2Keys": {
    "frontKey": "uuid_front.jpg",
    "backKey": "uuid_back.jpg",
    "signatureKey": "uuid_signature.png"
  }
}
```

### `GET /api/web-checkin/document/{dni}/{type}`
Obtiene una imagen de documento (front, back, signature).

**Response:** Imagen (JPEG o PNG)

---

## 🔧 Admin Endpoints (Testing)

### `POST /admin/create-session`
Crea una sesión de prueba para testing.

**Request:**
```json
{
  "reservationCode": "TEST2024",
  "guestName": "Vazquez, Fermin",
  "guestDni": "30627652",
  "checkInDate": "2024-12-20",
  "checkOutDate": "2024-12-25",
  "expiresInHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "token": "generated-uuid-token",
  "session": { ... },
  "url": "http://localhost:3000/generated-uuid-token"
}
```

---

## 🚀 Desarrollo Local

### 1. Instalar dependencias
```bash
npm install
```

### 2. Correr en modo dev
```bash
npm run dev
```

El Worker estará disponible en `http://localhost:8787`

### 3. Crear sesión de prueba
```bash
curl -X POST http://localhost:8787/admin/create-session \
  -H "Content-Type: application/json" \
  -d '{
    "guestName": "Vazquez, Fermin",
    "guestDni": "30627652"
  }'
```

Esto retornará un token que podés usar en el frontend:
```
http://localhost:3000/{token}
```

### 4. Validar token
```bash
curl http://localhost:8787/api/web-checkin/validate-token/{token}
```

---

## 📦 Deploy a Producción

### 1. Login a Cloudflare
```bash
npx wrangler login
```

### 2. Crear recursos necesarios

#### Crear R2 Bucket
```bash
npx wrangler r2 bucket create hotel-checkin-images
```

#### Crear KV Namespace
```bash
npx wrangler kv:namespace create CHECKIN_DATA
```

Copiar el ID generado y actualizarlo en `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CHECKIN_DATA"
id = "tu-kv-id-aqui"
```

#### Crear Queue
```bash
npx wrangler queues create checkin-sync
```

### 3. Deploy
```bash
npm run deploy
```

### 4. Ver logs en tiempo real
```bash
npm run tail
```

---

## 💾 Estructura de Datos

### KV Storage

**Sesiones (24h TTL):**
```
Key: session:{token}
Value: CheckinSession
```

**Check-ins:**
```
Key: checkin:{checkinId}
Value: CheckinData
```

**Index por DNI:**
```
Key: dni:{dni}
Value: { firstName, lastName, email, phone, uploadCount, lastVerified }
```

### R2 Storage

```
{checkinId}_front.jpg        - DNI frente
{checkinId}_back.jpg         - DNI dorso
{checkinId}_signature.png    - Firma digital
```

### Queue Messages

```typescript
{
  checkinId: string
  dni: string
  timestamp: string
}
```

---

## 🔄 Sincronización a FileMaker

El Queue Consumer (`queue()` handler en `src/index.ts`) procesa los mensajes de la cola y sincroniza a FileMaker.

**TODO:** Implementar la función `syncToFileMaker()` con:
- FileMaker Data API authentication
- Creación de registro en tabla de check-ins
- Upload de imágenes a FileMaker containers
- Envío de email de confirmación (Amazon SES)

---

## 📝 Notas

- El Worker usa TypeScript con tipos completos
- CORS está habilitado para desarrollo local
- Las imágenes se convierten de base64 a binary antes de guardar en R2
- Los tokens expiran en 24 horas por defecto
- El Queue Consumer procesa hasta 10 mensajes en batch

---

**Autor:** Fermin Vazquez
**Proyecto:** Web Check-in - Howard Johnson Merlo
