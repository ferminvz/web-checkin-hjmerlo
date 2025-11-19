/**
 * Utilidades para parsear datos del DNI argentino desde código PDF417
 */

export interface DniData {
  dni: string
  apellido: string
  nombre: string
  sexo?: string
  fechaNacimiento?: string
  fechaEmision?: string
  ejemplar?: string
  tramite?: string
}

/**
 * Parsea los datos del código PDF417 del DNI argentino
 *
 * Formato típico del PDF417:
 * TRAMITE@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@NACIMIENTO@EMISION@...
 *
 * Ejemplo:
 * 00123456789@GARCIA@JUAN PEDRO@M@12345678@A@19900115@20150101@...
 */
export function parsePDF417Data(rawData: string): DniData | null {
  try {
    console.log('Datos brutos del PDF417:', rawData)

    // Eliminar caracteres no imprimibles
    const cleanData = rawData.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    console.log('Datos limpios:', cleanData)

    // Verificar formato con @ como separador (formato argentino)
    if (!cleanData.includes('@')) {
      console.warn('Formato de PDF417 no reconocido (sin separador @)')
      return null
    }

    const fields = cleanData.split('@')
    console.log('Campos detectados:', fields)

    // Necesitamos al menos 8 campos para tener datos básicos
    if (fields.length < 8) {
      console.warn('Datos insuficientes en el PDF417')
      return null
    }

    // Formato estándar del DNI argentino:
    // [0] = Número de trámite
    // [1] = Apellido(s)
    // [2] = Nombre(s)
    // [3] = Sexo (M/F)
    // [4] = Número de documento
    // [5] = Ejemplar
    // [6] = Fecha de nacimiento (YYYYMMDD)
    // [7] = Fecha de emisión (YYYYMMDD)

    const data: DniData = {
      tramite: fields[0]?.trim() || '',
      apellido: fields[1]?.trim() || '',
      nombre: fields[2]?.trim() || '',
      sexo: fields[3]?.trim() || '',
      dni: fields[4]?.trim() || '',
      ejemplar: fields[5]?.trim() || '',
      fechaNacimiento: formatDateFromDni(fields[6]?.trim() || ''),
      fechaEmision: formatDateFromDni(fields[7]?.trim() || '')
    }

    console.log('Datos parseados:', data)

    // Validar que tengamos al menos DNI, apellido y nombre
    if (!data.dni || !data.apellido || !data.nombre) {
      console.warn('Datos esenciales faltantes')
      return null
    }

    return data

  } catch (error) {
    console.error('Error al parsear datos del PDF417:', error)
    return null
  }
}

/**
 * Formatea una fecha del formato YYYYMMDD a YYYY-MM-DD
 */
function formatDateFromDni(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) {
    return ''
  }

  try {
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)

    return `${year}-${month}-${day}`
  } catch (error) {
    console.error('Error al formatear fecha:', error)
    return ''
  }
}

/**
 * Valida un DNI argentino (7 u 8 dígitos)
 */
export function isValidArgentineDni(dni: string): boolean {
  const dniRegex = /^\d{7,8}$/
  return dniRegex.test(dni)
}

/**
 * Intenta extraer datos mediante OCR como fallback
 * Esta es una implementación básica que busca patrones conocidos
 */
export function extractDataFromOCR(text: string): Partial<DniData> | null {
  try {
    console.log('Intentando extraer datos mediante OCR:', text)

    const data: Partial<DniData> = {}

    // Limpiar texto - mantener estructura pero unificar espacios
    const cleanText = text.replace(/[↵\n\r]+/g, ' ').replace(/\s+/g, ' ').toUpperCase()

    // Buscar DNI: formato "30.627.652" o "30627652"
    // Buscar números de 7-8 dígitos, preferiblemente con puntos
    const dniMatch = cleanText.match(/\b(\d{2}[.\s]\d{3}[.\s]\d{3})\b/) ||
                     cleanText.match(/\b(\d{8})\b/) ||
                     cleanText.match(/\b(\d{7})\b/)

    if (dniMatch) {
      data.dni = dniMatch[1].replace(/[.\s]/g, '')
    }

    // Buscar apellido: buscar palabra de 4+ letras después de "Apellido" o "Surname"
    // Permitir hasta 50 caracteres de basura entre el label y el valor
    const apellidoMatch = cleanText.match(/(?:APELLIDO|SURNAME)[^A-ZÑ]{0,50}([A-ZÑ]{4,})/i)
    if (apellidoMatch) {
      const apellido = apellidoMatch[1].trim()
      // Filtrar palabras comunes que no son apellidos
      const excludeWords = ['SURNAME', 'APELLIDO', 'NAME', 'NOMBRE', 'SEXO', 'SEX']
      if (!excludeWords.includes(apellido) && apellido.length >= 4) {
        data.apellido = apellido
      }
    }

    // Buscar nombre: buscar palabra de 3+ letras después de "Nombre" o "Name"
    const nombreMatch = cleanText.match(/(?:NOMBRE|NAME)[^A-ZÑ]{0,50}([A-ZÑ]{3,}(?:\s+[A-ZÑ]+)?)/i)
    if (nombreMatch) {
      const nombre = nombreMatch[1].trim()
      // Filtrar solo palabras que son labels, no valores mal-reconocidos
      const excludeWords = ['SURNAME', 'APELLIDO', 'NAME', 'NOMBRE', 'SEXO', 'SEX']
      if (!excludeWords.includes(nombre) && nombre.length >= 3) {
        data.nombre = nombre
      }
    }

    // Buscar fecha de nacimiento después de "Date of birth" o "Nacimiento"
    // Más flexible para capturar incluso si OCR malinterpreta el día
    const fechaMatch = cleanText.match(/(?:NACIMIENTO|BIRTH)[:\s\/7]*[A-Z0-9]*\s*(\d{1,2})\s*([A-Z]{3,})\s*(\d{4})/i) ||
                       cleanText.match(/(\d{1,2})\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC|JAN|APR|AUG|DEC)[A-Z]*\s*(\d{4})/i)

    if (fechaMatch) {
      const [_, day, monthStr, year] = fechaMatch
      const months: Record<string, string> = {
        'ENE': '01', 'JAN': '01',
        'FEB': '02',
        'MAR': '03',
        'ABR': '04', 'APR': '04',
        'MAY': '05',
        'JUN': '06',
        'JUL': '07',
        'AGO': '08', 'AUG': '08',
        'SEP': '09',
        'OCT': '10',
        'NOV': '11',
        'DIC': '12', 'DEC': '12'
      }
      const month = months[monthStr.toUpperCase().substring(0, 3)] || '01'
      data.fechaNacimiento = `${year}-${month}-${day.padStart(2, '0')}`
    }

    console.log('Datos extraídos por OCR:', data)

    // Verificar que al menos tengamos DNI o apellido
    if (!data.dni && !data.apellido) {
      console.warn('No se pudieron extraer datos básicos mediante OCR')
      return null
    }

    return data

  } catch (error) {
    console.error('Error al extraer datos mediante OCR:', error)
    return null
  }
}
