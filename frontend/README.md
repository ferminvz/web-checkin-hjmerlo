# Web Check-in App - Howard Johnson Merlo

Frontend público para el sistema de web check-in.

## 🏗️ Stack

- **Framework**: Next.js 14.2.33 (App Router)
- **Styling**: Tailwind CSS + Gotham Font
- **Colores**: HJ Blue (#0057A0) + HJ Orange (#FF6B35)
- **Deploy**: Cloudflare Pages (via OpenNext.js)
- **Scanning**: ZXing (PDF417) + Tesseract.js (OCR)

## 🚀 Desarrollo

```bash
# Instalar dependencias
npm install

# Copiar .env
cp .env.example .env.local

# Correr en desarrollo
npm run dev
```

La app estará disponible en `http://localhost:3000`

## 📁 Estructura

```
checkin-app/
├── app/
│   ├── layout.tsx              # Layout principal
│   ├── page.tsx                # Landing page
│   ├── globals.css             # Estilos globales
│   └── [token]/
│       └── page.tsx            # Formulario web check-in
├── components/
│   ├── ui/                     # Componentes UI base
│   │   ├── Button.tsx          # Botón reutilizable
│   │   └── Input.tsx           # Input con validación
│   └── web-checkin/            # Componentes específicos
│       ├── SignaturePad.tsx    # Captura de firma digital
│       └── DniScanProgress.tsx # Progreso de escaneo DNI
├── lib/
│   ├── api.ts                  # Cliente API
│   ├── utils.ts                # Utilities generales
│   ├── dni-scanner.ts          # Scanner PDF417 + OCR
│   └── dni-parser.ts           # Parser de datos DNI argentino
└── public/                     # Assets estáticos
```

## 🎯 Funcionalidades

### Escaneo Automático de DNI
La app incluye **lectura automática del DNI argentino** mediante dos métodos:

1. **PDF417 (Primario)**: Lee el código de barras PDF417 del DNI
   - Prueba múltiples regiones de la imagen
   - Ajusta contraste automáticamente
   - Extrae todos los datos del documento

2. **OCR (Fallback)**: Si falla PDF417, usa Tesseract.js
   - Reconocimiento óptico de caracteres
   - Extracción de DNI, nombres y fecha de nacimiento

**Flujo de uso:**
1. Usuario captura foto del DNI (frente)
2. Sistema detecta automáticamente el código PDF417
3. Auto-completa formulario (DNI, apellido, nombre, fecha nacimiento)
4. Si falla → usuario completa manualmente

### Firma Digital
- Captura táctil con soporte para mouse y stylus
- Optimizada para dispositivos móviles
- Exportación en formato PNG base64

## 🔗 API

La app se conecta al Worker API deployado en:
`https://web-checkin-api.fvazquez-2f3.workers.dev`

## 🎨 Diseño

Sigue el mismo sistema de diseño que hotel-intranet:
- Font: Gotham
- Azul HJ: #0057A0
- Naranja HJ: #FF6B35
- Background: #f9fafb

## 📦 Deploy

```bash
# Build para Cloudflare Workers
npm run build:workers

# Preview local
npm run preview

# Deploy a producción
npm run deploy
```

---

**Autor:** Fermin Vazquez
**Proyecto:** Web Check-in - Howard Johnson Merlo
