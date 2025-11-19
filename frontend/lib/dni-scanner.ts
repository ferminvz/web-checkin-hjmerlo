/**
 * Funcionalidad de escaneo de DNI usando PDF417 y OCR
 */

import { BrowserPDF417Reader, DecodeHintType, BarcodeFormat } from '@zxing/library'
import { createWorker } from 'tesseract.js'
import { parsePDF417Data, extractDataFromOCR, type DniData } from './dni-parser'

export type ScanResult = {
  success: boolean
  data?: DniData | Partial<DniData>
  method?: 'pdf417' | 'ocr'
  error?: string
}

/**
 * Intenta leer el código PDF417 de una imagen del DNI
 */
export async function scanDniPDF417(imageElement: HTMLImageElement): Promise<ScanResult> {
  try {
    console.log('Iniciando lectura PDF417...')

    // Verificar que la imagen está cargada
    if (!imageElement.complete || !imageElement.naturalWidth) {
      return {
        success: false,
        error: 'Imagen no cargada correctamente'
      }
    }

    // Crear canvas para preprocesamiento
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return {
        success: false,
        error: 'No se pudo crear contexto de canvas'
      }
    }

    const width = imageElement.naturalWidth
    const height = imageElement.naturalHeight

    canvas.width = width
    canvas.height = height
    ctx.drawImage(imageElement, 0, 0)

    // Configurar lector PDF417
    const codeReader = new BrowserPDF417Reader()
    const hints = new Map()
    hints.set(DecodeHintType.TRY_HARDER, true)
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417])

    // Intento 1: Imagen completa
    console.log('Intento 1: Imagen completa')
    let result = await tryDecode(codeReader, imageElement)

    // Intento 2: Regiones específicas (DNI argentino - PDF417 en esquina inferior derecha)
    if (!result) {
      console.log('Intento 2: Probando regiones específicas')

      const regions = [
        // PRIORIDAD 1: Esquina inferior derecha (donde está el PDF417 en DNI argentino)
        { x: Math.floor(width * 0.5), y: Math.floor(height * 0.65),
          width: Math.floor(width * 0.5), height: Math.floor(height * 0.35) },
        // PRIORIDAD 2: Tercio inferior derecho (ampliado)
        { x: Math.floor(width * 0.4), y: Math.floor(height * 0.6),
          width: Math.floor(width * 0.6), height: Math.floor(height * 0.4) },
        // PRIORIDAD 3: Región inferior completa
        { x: 0, y: Math.floor(height * 0.6), width, height: Math.floor(height * 0.4) },
        // PRIORIDAD 4: Mitad inferior completa
        { x: 0, y: Math.floor(height * 0.5), width, height: Math.floor(height * 0.5) }
      ]

      for (const region of regions) {
        const regionCanvas = document.createElement('canvas')
        regionCanvas.width = region.width
        regionCanvas.height = region.height
        const regionCtx = regionCanvas.getContext('2d')

        if (regionCtx) {
          regionCtx.drawImage(
            canvas,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
          )

          result = await tryDecode(codeReader, regionCanvas)
          if (result) break
        }
      }
    }

    // Intento 3: Ajustar contraste
    if (!result) {
      console.log('Intento 3: Ajustando contraste')
      const imageData = ctx.getImageData(0, 0, width, height)
      const data = imageData.data

      const contrast = 1.5
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))

      for (let i = 0; i < data.length; i += 4) {
        data[i] = factor * (data[i] - 128) + 128
        data[i + 1] = factor * (data[i + 1] - 128) + 128
        data[i + 2] = factor * (data[i + 2] - 128) + 128
      }

      ctx.putImageData(imageData, 0, 0)
      result = await tryDecode(codeReader, canvas)
    }

    if (result) {
      console.log('PDF417 decodificado:', result)
      const parsedData = parsePDF417Data(result)

      if (parsedData) {
        return {
          success: true,
          data: parsedData,
          method: 'pdf417'
        }
      }
    }

    return {
      success: false,
      error: 'No se pudo detectar código PDF417'
    }

  } catch (error) {
    console.error('Error al escanear PDF417:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }
  }
}

/**
 * Intenta decodificar con ZXing
 */
async function tryDecode(
  reader: BrowserPDF417Reader,
  source: HTMLImageElement | HTMLCanvasElement
): Promise<string | null> {
  try {
    const result = await reader.decodeFromImageElement(source as HTMLImageElement)
    return result?.getText() || null
  } catch (error) {
    // No encontró código, es normal en algunos intentos
    return null
  }
}

/**
 * Usa OCR como fallback para extraer datos del DNI
 */
export async function scanDniOCR(
  imageElement: HTMLImageElement,
  onProgress?: (progress: number) => void
): Promise<ScanResult> {
  try {
    console.log('Iniciando OCR...')

    // Crear canvas y convertir a Blob
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return {
        success: false,
        error: 'No se pudo crear canvas'
      }
    }

    canvas.width = imageElement.naturalWidth || imageElement.width
    canvas.height = imageElement.naturalHeight || imageElement.height
    ctx.drawImage(imageElement, 0, 0)

    // Convertir canvas a Blob para Tesseract
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((blob) => {
          resolve(blob)
        }, 'image/jpeg', 0.95)
      } catch (error) {
        console.error('Error en toBlob:', error)
        resolve(null)
      }
    })

    if (!blob) {
      return {
        success: false,
        error: 'No se pudo convertir canvas a blob'
      }
    }

    const worker = await createWorker('spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress)
        }
      }
    })

    // Usar el blob en lugar del canvas
    const { data: { text } } = await worker.recognize(blob)
    console.log('Texto reconocido por OCR:', text)

    await worker.terminate()

    const extractedData = extractDataFromOCR(text)

    if (extractedData && extractedData.dni) {
      return {
        success: true,
        data: extractedData,
        method: 'ocr'
      }
    }

    return {
      success: false,
      error: 'No se pudieron extraer datos válidos'
    }

  } catch (error) {
    console.error('Error al ejecutar OCR:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error en OCR'
    }
  }
}

/**
 * Función principal que intenta PDF417 primero y OCR como fallback
 */
export async function scanDni(
  imageElement: HTMLImageElement,
  onProgress?: (status: string, progress?: number) => void
): Promise<ScanResult> {

  // Intento 1: PDF417
  onProgress?.('Buscando código PDF417...')
  const pdf417Result = await scanDniPDF417(imageElement)

  if (pdf417Result.success) {
    onProgress?.('Código PDF417 detectado', 100)
    return pdf417Result
  }

  // Intento 2: OCR como fallback
  onProgress?.('Intentando con OCR...')
  const ocrResult = await scanDniOCR(imageElement, (progress) => {
    onProgress?.('Procesando con OCR...', progress * 100)
  })

  if (ocrResult.success) {
    onProgress?.('Datos extraídos con OCR', 100)
    return ocrResult
  }

  // Falló todo
  onProgress?.('No se pudo leer automáticamente')
  return {
    success: false,
    error: 'No se pudo leer el documento automáticamente'
  }
}
