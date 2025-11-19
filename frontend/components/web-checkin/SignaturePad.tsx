'use client'

import { useRef, useEffect, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import Button from '@/components/ui/Button'

interface SignaturePadProps {
  onSave: (signature: string) => void
  onClear?: () => void
}

export default function SignaturePad({ onSave, onClear }: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    // Ajustar tamaño del canvas al contenedor
    const resizeCanvas = () => {
      if (sigCanvas.current) {
        const canvas = sigCanvas.current.getCanvas()
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        const width = canvas.offsetWidth
        const height = canvas.offsetHeight

        canvas.width = width * ratio
        canvas.height = height * ratio
        canvas.getContext('2d')?.scale(ratio, ratio)
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  const handleClear = () => {
    sigCanvas.current?.clear()
    setHasContent(false)
    onClear?.()
  }

  const handleSave = () => {
    if (!hasContent || sigCanvas.current?.isEmpty()) {
      console.log('Canvas está vacío, no se puede guardar')
      return
    }

    // Obtener firma como base64
    const signatureData = sigCanvas.current?.toDataURL('image/png')
    if (signatureData) {
      console.log('Firma capturada, tamaño:', signatureData.length, 'caracteres')
      onSave(signatureData)
    }
  }

  // Actualizar estado cuando el usuario dibuja
  const handleEnd = () => {
    const isEmpty = sigCanvas.current?.isEmpty() ?? true
    console.log('Stroke finalizado, isEmpty:', isEmpty)
    setHasContent(!isEmpty)
  }

  return (
    <div className="w-full">
      <div className="bg-white border-2 border-gray-300 rounded-lg overflow-hidden mb-4 relative">
        <SignatureCanvas
          ref={sigCanvas}
          onEnd={handleEnd}
          canvasProps={{
            className: 'w-full h-48 touch-none cursor-crosshair',
            style: { touchAction: 'none' }
          }}
          backgroundColor="#ffffff"
          penColor="#000000"
          minWidth={0.5}
          maxWidth={2.5}
          velocityFilterWeight={0.7}
          dotSize={1}
        />

        {/* Línea de guía */}
        <div className="absolute bottom-16 left-0 right-0 border-b border-gray-300 pointer-events-none"></div>

        {/* Texto de ayuda */}
        <div className="absolute top-2 left-4 text-sm text-gray-400 pointer-events-none select-none">
          Firmá aquí
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={handleClear}
          className="flex-1"
        >
          🗑️ Borrar
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasContent}
          className="flex-1"
        >
          ✓ Confirmar Firma
        </Button>
      </div>

      <p className="mt-3 text-sm text-gray-500 text-center">
        Usá tu dedo o stylus para firmar en el recuadro
      </p>
    </div>
  )
}
