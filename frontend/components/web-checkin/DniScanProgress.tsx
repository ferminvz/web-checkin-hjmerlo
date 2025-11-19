'use client'

interface DniScanProgressProps {
  status: string
  progress?: number
  isScanning: boolean
}

export default function DniScanProgress({ status, progress, isScanning }: DniScanProgressProps) {
  if (!isScanning && !status) return null

  return (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center space-x-3">
        {isScanning && (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">{status}</p>
          {progress !== undefined && progress > 0 && (
            <div className="mt-2">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-blue-600 mt-1">{Math.round(progress)}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
