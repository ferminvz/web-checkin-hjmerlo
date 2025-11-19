/**
 * Utility functions
 */

/**
 * Validar email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validar DNI argentino
 */
export function isValidDni(dni: string): boolean {
  const dniRegex = /^\d{7,8}$/
  return dniRegex.test(dni)
}

/**
 * Formatear fecha
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Comprimir imagen a base64
 */
export async function compressImage(file: File, maxWidth = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Redimensionar si es necesario
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo obtener contexto del canvas'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        // Convertir a base64
        const base64 = canvas.toDataURL('image/jpeg', quality)
        resolve(base64)
      }

      img.onerror = () => reject(new Error('Error al cargar imagen'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('Error al leer archivo'))
    reader.readAsDataURL(file)
  })
}

/**
 * Capturar imagen desde cámara
 */
export async function captureImageFromCamera(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment' as any // Para usar cámara trasera

    let resolved = false

    input.onchange = (e) => {
      if (resolved) return
      resolved = true
      const file = (e.target as HTMLInputElement).files?.[0]
      console.log('Archivo seleccionado:', file)
      resolve(file || null)
    }

    // Si el usuario cancela (detectar cuando el input pierde foco)
    input.oncancel = () => {
      if (resolved) return
      resolved = true
      console.log('Captura cancelada por el usuario')
      resolve(null)
    }

    // Fallback para detectar cancelación
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (!resolved && !input.files?.length) {
          resolved = true
          console.log('Captura cancelada (timeout)')
          resolve(null)
        }
      }, 500)
    }, { once: true })

    input.click()
  })
}

/**
 * Sanitizar string
 */
export function sanitize(str: string): string {
  if (!str) return ''
  return str.replace(/[<>"']/g, '')
}
