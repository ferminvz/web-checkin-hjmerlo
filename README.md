# Web Check-in - Howard Johnson Merlo

Sistema completo de check-in online para hotel con integración FileMaker.

## 🏗️ Estructura del Proyecto

```
web-checkin-hjmerlo/
├── frontend/          # Next.js app (interfaz de usuario)
├── backend/           # Cloudflare Worker (API + sync FileMaker)
├── docs/              # Documentación
└── README.md          # Este archivo
```

## 🚀 URLs del Proyecto

- **Frontend**: https://checkin.hjmerlo.fun
- **API (Worker)**: https://web-checkin-api.fvazquez-2f3.workers.dev
- **FileMaker**: https://fm.hjmerlo.fun

## 📊 Stack Tecnológico

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form
- **Features**:
  - Escaneo DNI con PDF417 + OCR (Tesseract.js)
  - Firma digital (canvas)
  - Captura de fotos con cámara
  - Responsive design para móviles

### Backend
- **Runtime**: Cloudflare Workers
- **Storage**:
  - Cloudflare R2 (imágenes)
  - Cloudflare KV (sesiones y datos)
- **Database**: FileMaker Pro (vía Data API)
- **Sync**: Cron Trigger (cada 5 minutos)

## 📝 Flujo de Usuario

1. **Generación de token** (FileMaker) → Email al huésped
2. **Huésped abre link** → Valida token
3. **Captura DNI** → Frente + Dorso (auto-completa datos con PDF417/OCR)
4. **Completa datos** → Nombre, Email, Domicilio, WhatsApp
5. **Firma digital** → Firma en canvas
6. **Review y confirmar** → Revisa todos los datos
7. **Submit** → Guarda en R2 + KV
8. **Sync automático** → Cron sincroniza a FileMaker cada 5 min

## 🔧 Desarrollo

### Frontend
```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Backend
```bash
cd backend
npm install
npx wrangler dev  # Local worker
npx wrangler deploy  # Deploy a producción
```

## 📚 Documentación

- [Integración FileMaker](./backend/FILEMAKER_INTEGRATION.md)
- [Configuración Campos FileMaker](./docs/filemaker-fields.md)
- [API Endpoints](./docs/api-endpoints.md)

## 👥 Soporte Multi-Guest

El sistema soporta múltiples huéspedes por reserva:
- **1 sesión** = 1 reserva
- **N guests** = titular + acompañantes
- **Tracking**: `completedGuests / totalGuests`

## 🔐 Seguridad

- Tokens con expiración de 72 horas
- Almacenamiento seguro en R2 (privado)
- Sincronización automática a FileMaker
- Backup de datos en múltiples ubicaciones

## 📞 Contacto

**Proyecto:** Web Check-in Howard Johnson Merlo
**Desarrollador:** Fermin Vazquez
**Fecha:** Noviembre 2025
