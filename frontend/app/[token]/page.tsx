'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import SignaturePad from '@/components/web-checkin/SignaturePad'
import DniScanProgress from '@/components/web-checkin/DniScanProgress'
import { validateToken, submitGuest, ValidateTokenResponse } from '@/lib/api'
import { isValidEmail, isValidDni, compressImage, captureImageFromCamera } from '@/lib/utils'
import { scanDni, scanDniOCR } from '@/lib/dni-scanner'
import type { DniData } from '@/lib/dni-parser'

interface FormData {
  dni: string
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
  address: string
  whatsappNumber: string
}

export default function WebCheckinPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [isValidating, setIsValidating] = useState(true)
  const [sessionData, setSessionData] = useState<ValidateTokenResponse | null>(null)
  const [step, setStep] = useState(1)
  const [frontImage, setFrontImage] = useState<string | null>(null)
  const [backImage, setBackImage] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Estados para el scanning de DNI
  const [isScanning, setIsScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [scanProgress, setScanProgress] = useState(0)

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>()

  // Validar token al cargar
  useEffect(() => {
    const validate = async () => {
      // Modo demo para desarrollo local
      const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

      if (isDemoMode) {
        // Datos de prueba para modo demo
        const demoData: ValidateTokenResponse = {
          sessionId: 'demo-session-123',
          reservationCode: 'DEMO2024',
          guestDni: '',
          guestName: '',
          checkInDate: '2024-12-20',
          checkOutDate: '2024-12-25',
          totalGuests: 4,
          completedGuests: 0
        }

        setSessionData(demoData)
        // NO pre-llenar los datos - deben venir del scanner
        setIsValidating(false)

        toast.success('Modo demo activado - Podés probar toda la UI', { duration: 3000 })
        return
      }

      // Modo producción - validar token real
      try {
        const data = await validateToken(token)
        setSessionData(data)

        // Pre-llenar datos si los hay
        if (data.guestName) {
          const [lastName, ...firstNameParts] = data.guestName.split(', ')
          setValue('lastName', lastName || '')
          setValue('firstName', firstNameParts.join(' ') || '')
        }
        if (data.guestDni) {
          setValue('dni', data.guestDni)
        }

        setIsValidating(false)
      } catch (error) {
        toast.error('Token inválido o expirado')
        setTimeout(() => router.push('/'), 2000)
      }
    }

    validate()
  }, [token, router, setValue])

  // Capturar foto DNI
  const handleCapturePhoto = async (type: 'front' | 'back') => {
    try {
      console.log(`Iniciando captura de foto ${type}`)
      const file = await captureImageFromCamera()

      if (!file) {
        console.log('No se seleccionó ningún archivo')
        return
      }

      console.log('Archivo capturado:', file.name, file.size, 'bytes')
      console.log('Comprimiendo imagen...')
      const compressed = await compressImage(file)
      console.log('Imagen comprimida, tamaño base64:', compressed.length, 'caracteres')

      if (type === 'front') {
        setFrontImage(compressed)
        toast.success('Foto del frente capturada')

        // En el frente: Solo OCR para datos visuales
        await scanDniFront(compressed)
      } else {
        setBackImage(compressed)
        toast.success('Foto del dorso capturada')

        // En el dorso: Intentar PDF417 (donde está el código de barras)
        await scanDniBack(compressed)
      }
    } catch (error) {
      console.error('Error al capturar foto:', error)
      toast.error('Error al capturar foto: ' + (error instanceof Error ? error.message : 'Error desconocido'))
    }
  }

  // Escanear DNI frente (solo OCR - más rápido)
  const scanDniFront = async (imageBase64: string) => {
    try {
      setIsScanning(true)
      setScanStatus('Leyendo texto del DNI con OCR...')
      setScanProgress(0)

      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageBase64
      })

      // Solo OCR en el frente (más rápido que PDF417)
      const result = await scanDniOCR(img, (progress) => {
        setScanStatus(`Procesando con OCR... ${Math.round(progress * 100)}%`)
        setScanProgress(progress * 100)
      })

      setIsScanning(false)

      if (result.success && result.data) {
        const dniData = result.data as DniData

        if (dniData.dni) setValue('dni', dniData.dni)
        if (dniData.apellido) setValue('lastName', dniData.apellido)
        if (dniData.nombre) setValue('firstName', dniData.nombre)
        if (dniData.fechaNacimiento) setValue('birthDate', dniData.fechaNacimiento)

        toast.success('Datos extraídos del frente con OCR')
        setScanStatus('✓ Datos detectados con OCR')
      } else {
        setScanStatus('No se pudieron leer datos. Completá manualmente.')
        toast('Completá los datos manualmente', { icon: 'ℹ️' })
      }
    } catch (error) {
      console.error('Error al escanear frente:', error)
      setIsScanning(false)
      setScanStatus('Error al escanear. Completá manualmente.')
    }
  }

  // Escanear DNI dorso (PDF417 + OCR fallback)
  const scanDniBack = async (imageBase64: string) => {
    try {
      setIsScanning(true)
      setScanStatus('Buscando código PDF417 en el dorso...')
      setScanProgress(0)

      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageBase64
      })

      // Escanear con PDF417 primero, OCR como fallback
      const result = await scanDni(img, (status, progress) => {
        setScanStatus(status)
        if (progress !== undefined) {
          setScanProgress(progress)
        }
      })

      setIsScanning(false)

      if (result.success && result.data) {
        const dniData = result.data as DniData

        if (dniData.dni) setValue('dni', dniData.dni)
        if (dniData.apellido) setValue('lastName', dniData.apellido)
        if (dniData.nombre) setValue('firstName', dniData.nombre)
        if (dniData.fechaNacimiento) setValue('birthDate', dniData.fechaNacimiento)

        const method = result.method === 'pdf417' ? 'código PDF417' : 'OCR'
        toast.success(`Datos extraídos del dorso usando ${method}`)
        setScanStatus(`✓ Datos detectados con ${method}`)
      } else {
        setScanStatus('No se pudo leer automáticamente')
      }
    } catch (error) {
      console.error('Error al escanear dorso:', error)
      setIsScanning(false)
      setScanStatus('')
    }
  }

  const handleSaveSignature = (signatureData: string) => {
    setSignature(signatureData)
    toast.success('Firma guardada')
    setStep(5) // Avanzar a paso de revisión
  }

  // Enviar formulario
  const onSubmit = async (data: FormData) => {
    if (!frontImage || !backImage || !signature) {
      toast.error('Por favor completá todos los pasos')
      return
    }

    setIsSubmitting(true)

    try {
      const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

      if (isDemoMode) {
        // Modo demo - simular envío exitoso
        await new Promise(resolve => setTimeout(resolve, 1500))
        toast.success('Check-in completado exitosamente!')
        setStep(6) // Pantalla de éxito
      } else {
        // Modo producción - enviar al API
        const currentGuestNumber = (sessionData?.completedGuests || 0) + 1
        const isFirstGuest = currentGuestNumber === 1

        const result = await submitGuest({
          token,
          guestType: isFirstGuest ? 'Titular' : 'Acompañante',
          order: currentGuestNumber,
          dni: data.dni,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          birthDate: data.birthDate,
          address: data.address,
          whatsappNumber: data.whatsappNumber,
          frontImage,
          backImage,
          signature,
        })

        if (result.allCompleted) {
          toast.success('Check-in completado para todos los huéspedes!')
          setStep(6) // Pantalla de éxito
        } else {
          toast.success(`Check-in guardado (${result.completedGuests}/${result.totalGuests})`)
          // TODO: Cargar siguiente acompañante
          setStep(6) // Por ahora ir a éxito
        }
      }
    } catch (error) {
      toast.error('Error al completar check-in')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-hj-blue to-hj-blue-dark flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Validando token...</p>
        </div>
      </div>
    )
  }

  if (step === 6) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            ¡Check-in Completado!
          </h1>
          <p className="text-gray-600 mb-6">
            Tu registro ha sido completado exitosamente. ¡Te esperamos en el hotel!
          </p>
          <p className="text-sm text-gray-500">
            Podés cerrar esta ventana.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-hj-blue to-hj-blue-dark rounded-2xl shadow-xl p-8 mb-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Web Check-in</h1>
          <p className="text-blue-100">Howard Johnson Merlo</p>
          {sessionData && (
            <div className="mt-4 pt-4 border-t border-blue-400">
              <p className="text-sm">Hola, {sessionData.guestName}!</p>
              <p className="text-sm text-blue-100">Reserva: {sessionData.reservationCode}</p>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= s ? 'bg-hj-blue text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s}
                </div>
                {s < 5 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-hj-blue' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600">
            Paso {step} de 5
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md p-8">
          {/* PASO 1: Foto DNI Frente */}
          {step === 1 && (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Foto del DNI - Frente
              </h2>
              <p className="text-gray-600 mb-6">
                Tomá una foto del frente de tu DNI. El sistema intentará leer automáticamente tus datos.
              </p>

              {/* Progreso del escaneo de DNI */}
              <DniScanProgress
                status={scanStatus}
                progress={scanProgress}
                isScanning={isScanning}
              />

              {frontImage ? (
                <div>
                  <img src={frontImage} alt="DNI Frente" className="max-w-full rounded-lg mb-4 mx-auto" />
                  <div className="flex gap-3 justify-center">
                    <Button variant="secondary" onClick={() => {
                      setFrontImage(null)
                      setScanStatus('')
                      setScanProgress(0)
                    }}>
                      Tomar de nuevo
                    </Button>
                    <Button onClick={() => setStep(2)}>
                      Continuar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => handleCapturePhoto('front')} fullWidth>
                  📷 Capturar Foto
                </Button>
              )}
            </div>
          )}

          {/* PASO 2: Foto DNI Dorso */}
          {step === 2 && (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Foto del DNI - Dorso
              </h2>
              <p className="text-gray-600 mb-6">
                Tomá una foto del dorso de tu DNI. El código PDF417 permite lectura automática.
              </p>

              {/* Progreso del escaneo */}
              <DniScanProgress
                status={scanStatus}
                progress={scanProgress}
                isScanning={isScanning}
              />

              {backImage ? (
                <div>
                  <img src={backImage} alt="DNI Dorso" className="max-w-full rounded-lg mb-4 mx-auto" />
                  <div className="flex gap-3 justify-center">
                    <Button variant="secondary" onClick={() => setStep(1)}>
                      ← Volver
                    </Button>
                    <Button variant="secondary" onClick={() => {
                      setBackImage(null)
                      setScanStatus('')
                      setScanProgress(0)
                    }}>
                      Tomar de nuevo
                    </Button>
                    <Button onClick={() => setStep(3)}>
                      Continuar →
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={() => handleCapturePhoto('back')} fullWidth>
                    📷 Capturar Foto
                  </Button>
                  <Button variant="secondary" onClick={() => setStep(1)} fullWidth>
                    ← Volver
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* PASO 3: Datos Personales */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Datos Personales
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                {scanStatus.includes('detectados')
                  ? 'Verificá que los datos sean correctos y completá los campos faltantes.'
                  : 'Completá tus datos personales.'}
              </p>

              <form onSubmit={handleSubmit(() => setStep(4))} className="space-y-4">
                <Input
                  label="DNI"
                  {...register('dni', {
                    required: 'DNI requerido',
                    validate: (v) => isValidDni(v) || 'DNI inválido'
                  })}
                  error={errors.dni?.message}
                  placeholder="12345678"
                />
                <Input
                  label="Apellido"
                  {...register('lastName', { required: 'Apellido requerido' })}
                  error={errors.lastName?.message}
                />
                <Input
                  label="Nombre"
                  {...register('firstName', { required: 'Nombre requerido' })}
                  error={errors.firstName?.message}
                />
                <Input
                  label="Email"
                  type="email"
                  {...register('email', {
                    required: 'Email requerido',
                    validate: (v) => isValidEmail(v) || 'Email inválido'
                  })}
                  error={errors.email?.message}
                />
                <Input
                  label="Teléfono"
                  {...register('phone')}
                  placeholder="+54 9 11 1234-5678"
                />
                <Input
                  label="Fecha de Nacimiento"
                  type="date"
                  {...register('birthDate')}
                />
                <Input
                  label="Domicilio"
                  {...register('address', { required: 'Domicilio requerido' })}
                  error={errors.address?.message}
                  placeholder="Calle 123, Ciudad, Provincia"
                />
                <Input
                  label="WhatsApp (opcional)"
                  {...register('whatsappNumber')}
                  placeholder="+54 9 11 1234-5678"
                />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setStep(2)} type="button">
                    ← Volver
                  </Button>
                  <Button type="submit" className="flex-1">
                    Continuar →
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* PASO 4: Firma Digital */}
          {step === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Firma Digital
              </h2>
              <p className="text-gray-600 mb-6">
                Por favor, firmá en el recuadro de abajo con tu dedo o stylus
              </p>
              <SignaturePad
                onSave={handleSaveSignature}
                onClear={() => setSignature(null)}
              />
              <div className="mt-4">
                <Button variant="secondary" onClick={() => setStep(3)} fullWidth>
                  ← Volver
                </Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Revisar y Confirmar
              </h2>

              <div className="space-y-6 mb-6">
                {/* Datos Personales */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-3">Datos Personales</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">DNI:</span>
                      <span className="font-medium">{watch('dni') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Apellido:</span>
                      <span className="font-medium">{watch('lastName') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Nombre:</span>
                      <span className="font-medium">{watch('firstName') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium">{watch('email') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Teléfono:</span>
                      <span className="font-medium">{watch('phone') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fecha de Nacimiento:</span>
                      <span className="font-medium">{watch('birthDate') || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Domicilio:</span>
                      <span className="font-medium">{watch('address') || '-'}</span>
                    </div>
                    {watch('whatsappNumber') && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">WhatsApp:</span>
                        <span className="font-medium">{watch('whatsappNumber')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Imágenes */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-700">Documentación</h3>

                  <div className="grid grid-cols-2 gap-4">
                    {frontImage && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">DNI Frente</p>
                        <img src={frontImage} alt="DNI Frente" className="w-full rounded-lg border" />
                      </div>
                    )}

                    {backImage && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">DNI Dorso</p>
                        <img src={backImage} alt="DNI Dorso" className="w-full rounded-lg border" />
                      </div>
                    )}
                  </div>

                  {signature && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Firma</p>
                      <img src={signature} alt="Firma" className="max-w-xs rounded-lg border bg-white" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setStep(4)} fullWidth>
                  ← Volver
                </Button>
                <Button
                  onClick={handleSubmit(onSubmit)}
                  isLoading={isSubmitting}
                  fullWidth
                >
                  Completar Check-in
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
