import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  isLoading?: boolean
  fullWidth?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'px-6 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

  const variantStyles = {
    primary: 'bg-hj-blue hover:bg-hj-blue-dark text-white shadow-md hover:shadow-lg',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-md',
  }

  const widthStyle = fullWidth ? 'w-full' : ''

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${widthStyle} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Procesando...
        </span>
      ) : (
        children
      )}
    </button>
  )
}
