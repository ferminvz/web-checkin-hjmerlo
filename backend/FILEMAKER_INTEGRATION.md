# Integración FileMaker con Web Check-in

## 📡 Endpoint para generar tokens

**URL:** `https://web-checkin-api.fvazquez-2f3.workers.dev/api/web-checkin/create-session`

**Método:** POST

**Content-Type:** application/json

---

## 🔧 Script FileMaker con MBS Plugin

### Script: "Generate Web Checkin Link"

```
# ==================================================
# PASO 1: Validar que el registro tenga datos
# ==================================================

# Verificar campos requeridos
If [IsEmpty(WEB_checkin_sessions::id_session) or
    IsEmpty(WEB_checkin_sessions::guest_dni) or
    IsEmpty(WEB_checkin_sessions::guest_name)]

  Show Custom Dialog ["✗ Error"; "El registro no tiene los datos necesarios. Completá los campos requeridos primero."]
  Exit Script []

End If

# ==================================================
# PASO 2: Construir JSON Request (con validación)
# ==================================================

Set Variable [$json; Value:
  "{" &
  "\"id_session\": " & WEB_checkin_sessions::id_session & "," &
  "\"reservation_code\": \"" & Substitute(WEB_checkin_sessions::reservation_code; "\""; "\\\"") & "\"," &
  "\"guest_name\": \"" & Substitute(WEB_checkin_sessions::guest_name; "\""; "\\\"") & "\"," &
  "\"guest_dni\": \"" & WEB_checkin_sessions::guest_dni & "\"," &
  "\"check_in_date\": \"" & WEB_checkin_sessions::check_in_date & "\"," &
  "\"check_out_date\": \"" & WEB_checkin_sessions::check_out_date & "\"," &
  "\"email\": \"" & Substitute(WEB_checkin_sessions::email_address; "\""; "\\\"") & "\"," &
  "\"total_guests\": " & WEB_checkin_sessions::total_guests &
  "}"
]

# ==================================================
# PASO 3: Configurar CURL con MBS Plugin
# ==================================================

Set Variable [$curl; Value: MBS("CURL.New")]

# URL del endpoint
Set Variable [$result; Value: MBS("CURL.SetOptionURL"; $curl; "https://web-checkin-api.fvazquez-2f3.workers.dev/api/web-checkin/create-session")]

# Método POST
Set Variable [$result; Value: MBS("CURL.SetOptionPost"; $curl; 1)]

# Headers
Set Variable [$result; Value: MBS("CURL.SetOptionHTTPHeader"; $curl; "Content-Type: application/json")]

# Body (JSON)
Set Variable [$result; Value: MBS("CURL.SetOptionPostFields"; $curl; $json)]

# ==================================================
# PASO 4: Ejecutar Request
# ==================================================

Set Variable [$result; Value: MBS("CURL.Perform"; $curl)]

# ==================================================
# PASO 5: Obtener Response
# ==================================================

Set Variable [$response; Value: MBS("CURL.GetResultAsText"; $curl)]
Set Variable [$httpCode; Value: MBS("CURL.GetResponseCode"; $curl)]

# Limpiar
Set Variable [$result; Value: MBS("CURL.Cleanup"; $curl)]

# ==================================================
# PASO 6: Validar respuesta
# ==================================================

If [$httpCode = 200]

  # Parsear JSON response
  Set Variable [$token; Value: MBS("JSON.GetPathItem"; $response; "token")]
  Set Variable [$link; Value: MBS("JSON.GetPathItem"; $response; "link")]
  Set Variable [$expires_at; Value: MBS("JSON.GetPathItem"; $response; "expires_at")]

  # Guardar en FileMaker
  Set Field [WEB_checkin_sessions::unique_token; $token]
  Set Field [WEB_checkin_sessions::link_sent_via; "pending"]
  Set Field [WEB_checkin_sessions::link_expires_at; $expires_at]

  Commit Records/Requests [Skip data entry validation; No dialog]

  # Éxito
  Show Custom Dialog ["✓ Link generado"; $link]

Else
  # Error
  Show Custom Dialog ["✗ Error"; "HTTP " & $httpCode & "¶¶" & $response]
End If
```

---

## 📝 Ejemplo de JSON Request

```json
{
  "id_session": 123,
  "reservation_code": "ABC123",
  "guest_name": "Vazquez, Fermin",
  "guest_dni": "30627652",
  "check_in_date": "20/11/2025",
  "check_out_date": "23/11/2025",
  "email": "guest@example.com",
  "total_guests": 4
}
```

---

## 📝 Ejemplo de JSON Response (success)

```json
{
  "success": true,
  "token": "c4a93c7b-1199-4818-ba3d-2115b33c23d9",
  "session": {
    "sessionId": "123",
    "reservationCode": "ABC123",
    "guestName": "Vazquez, Fermin",
    "guestDni": "30627652",
    "checkInDate": "2025-11-20",
    "checkOutDate": "2025-11-23",
    "createdAt": "2025-11-18T20:33:29.759Z",
    "expiresAt": 1763757209759
  },
  "link": "https://checkin.hjmerlo.fun/c4a93c7b-1199-4818-ba3d-2115b33c23d9",
  "expires_at": "2025-11-21T20:33:29.759Z"
}
```

**Parsear con MBS:**
- `token`: `MBS("JSON.GetPathItem"; $response; "token")`
- `link`: `MBS("JSON.GetPathItem"; $response; "link")`
- `expires_at`: `MBS("JSON.GetPathItem"; $response; "expires_at")`

---

## 🔄 Flujo completo desde FileMaker

### Paso a paso detallado:

#### 1️⃣ ARION sincroniza reservas → FileMaker
- Tus scripts existentes ya traen las reservas de ARION
- Datos necesarios: código reserva, nombre, DNI, email, check-in date, check-out date

#### 2️⃣ Script Scheduled: "Find Reservations Needing Checkin" (corre diariamente)
```
Go to Layout ["ARION_Reservas"]
Enter Find Mode []
Set Field [check_in_date; Get(CurrentDate) + 3]  # Check-in en 3 días
Set Field [dni; "*"]  # Que tenga DNI
Set Field [email; "*"]  # Que tenga email
Perform Find []

Loop (por cada reserva encontrada)
  # Verificar si ya tiene sesión web creada
  Set Variable [$existingSession; ExecuteSQL("SELECT id_session FROM WEB_checkin_sessions WHERE reservation_code = ?"; ""; ""; ARION_Reservas::codigo_reserva)]

  If [IsEmpty($existingSession)]
    # CREAR REGISTRO en WEB_checkin_sessions
    Go to Layout ["WEB_checkin_sessions"]
    New Record/Request
    Set Field [reservation_code; ARION_Reservas::codigo_reserva]
    Set Field [guest_name; ARION_Reservas::nombre_completo]
    Set Field [guest_dni; ARION_Reservas::dni]
    Set Field [check_in_date; ARION_Reservas::check_in_date]
    Set Field [check_out_date; ARION_Reservas::check_out_date]
    Set Field [email_address; ARION_Reservas::email]
    Set Field [link_sent_via; "pending"]
    Commit Records/Requests

    # Generar token llamando al Worker API
    Perform Script ["Generate Web Checkin Link"]

    # Enviar email con SES (script que ya tenés)
    Perform Script ["Send Checkin Email via SES"]
  End If
End Loop
```

#### 3️⃣ Script: "Generate Web Checkin Link"
- Valida que el registro tenga datos (id_session, dni, nombre)
- Construye JSON con datos de WEB_checkin_sessions
- Llama al Worker API con MBS CURL
- Worker retorna: token, link, expires_at
- Guarda `unique_token` en FileMaker
- Marca `link_sent_date` = fecha actual

#### 4️⃣ Script: "Send Checkin Email via SES" (el que ya tenés funcionando)
- Subject: "Web Check-in - Howard Johnson Merlo"
- Body: "Hola [nombre], completá tu check-in en: https://checkin.hjmerlo.fun/[token]"
- Marca `link_sent_via` = "email"
- Marca `email_sent_success` = 1

#### 5️⃣ Huésped recibe email y completa check-in
- Abre el link https://checkin.hjmerlo.fun/[token]
- Sube fotos DNI frente/dorso
- Escaneo PDF417 auto-completa datos
- Firma digital
- Revisa y confirma

#### 6️⃣ Worker guarda en KV + R2
- Imágenes → Cloudflare R2
- Datos check-in → Cloudflare KV
- Marca `syncedToFileMaker = false`

#### 7️⃣ Cron (cada 5 min) sincroniza a FileMaker
- Lee check-ins pendientes de KV
- Crea registro en **WEB_guest_documents**
- Actualiza **WEB_checkin_sessions**:
  - `completed` = 1
  - `completed_at` = timestamp
  - `id_document_created` = recordId del documento
- Marca en KV: `syncedToFileMaker = true`

---

## ⚠️ Solución al error de JSON inválido

**Problema**: Si ejecutás "Generate Web Checkin Link" en un registro vacío de WEB_checkin_sessions, genera JSON inválido:
```json
{"id_session": ,"reservation_code": "",...}
```

**Solución**: SIEMPRE crear el registro con datos ANTES de llamar al script:

### Opción 1: Crear manualmente para testing
1. Ir a layout WEB_checkin_sessions
2. Nuevo registro
3. Completar: reservation_code, guest_name, guest_dni, check_in_date, check_out_date, email
4. Guardar
5. Ejecutar "Generate Web Checkin Link"

### Opción 2: Automatizar con script (recomendado)
El script "Find Reservations Needing Checkin" (arriba) crea el registro completo desde ARION antes de llamar al API.

---

---

## 📊 Campos necesarios en las tablas

### WEB_checkin_sessions (1 registro por reserva)

**Antes de llamar al API:**
- `id_session` (Number, auto-enter serial)
- `reservation_code` (Text)
- `guest_name` (Text) ← Titular
- `guest_dni` (Text) ← Titular
- `check_in_date` (Text - formato DD/MM/YYYY)
- `check_out_date` (Text - formato DD/MM/YYYY)
- `email_address` (Text) ← Titular
- `total_guests` (Number) ← Cuántas personas en total (titular + acompañantes)

**Después de llamar al API:**
- `unique_token` (Text) ← se guarda automáticamente desde el Worker
- `link_sent_via` (Text) ← actualizar a "email" después de enviar
- `link_expires_at` (Timestamp) ← calculado por el Worker
- `completed_guests` (Number) ← Contador de personas que completaron check-in
- `completed` (Number 0/1) ← 1 cuando completed_guests = total_guests
- `completed_at` (Timestamp) ← Cuando se completó el último guest

### WEB_guest_documents (N registros por sesión - 1 por cada persona)

**Campos para cada huésped:**
- `id_document` (Number, auto-enter serial)
- `id_session` (Number, FK → WEB_checkin_sessions::id_session)
- `guest_type` (Text) ← "Titular" o "Acompañante"
- `order` (Number) ← 1=titular, 2=acompañante1, 3=acompañante2, etc.
- `dni_number` (Text)
- `document_type` (Text) ← "DNI"
- `first_name` (Text)
- `last_name` (Text)
- `birth_date` (Text - opcional)
- `address` (Text) ← **NUEVO** - Requerido legalmente
- `email` (Text)
- `phone` (Text)
- `whatsapp_number` (Text) ← **NUEVO** - Para notificaciones
- `whatsapp_validated` (Number 0/1) ← **NUEVO** - Si se validó el WhatsApp
- `r2_front_key` (Text) ← Key en R2 de foto DNI frente
- `r2_back_key` (Text) ← Key en R2 de foto DNI dorso
- `r2_signature_key` (Text) ← Key en R2 de firma digital
- `pdf417_parsed_successfully` (Number 0/1)
- `ocr_fallback_used` (Number 0/1)
- `upload_count` (Number)
- `status` (Text) ← "Verified"
- `created_at` (Timestamp)

---

## ⚠️ Notas importantes

1. **El Worker actualiza automáticamente FileMaker** con el `unique_token` cuando creás la sesión
2. El token **expira en 72 horas** (3 días)
3. Podés regenerar un token llamando al endpoint de nuevo con el mismo `id_session`
4. **Ya tenés Amazon SES configurado** - solo necesitás enviar el email con el link

---

## ✅ Checklist

- [ ] Instalar MBS Plugin en FileMaker (ya lo tenés)
- [ ] Crear script "Generate Web Checkin Link" (copiar código de arriba)
- [ ] Testear con 1 reserva manual
- [ ] Crear script scheduled para auto-envío
- [ ] Configurar envío de email con SES (ya lo tenés)
- [ ] Probar flujo completo end-to-end

---

**Autor:** Fermin Vazquez
**Proyecto:** Web Check-in - Howard Johnson Merlo
