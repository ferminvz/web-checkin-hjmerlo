export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-hj-blue to-hj-blue-dark flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        <div className="mb-8">
          {/* Logo placeholder - agregar logo real después */}
          <div className="w-32 h-32 mx-auto mb-6 bg-hj-blue rounded-full flex items-center justify-center">
            <span className="text-white text-5xl font-bold">HJ</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-hj-blue mb-4">
            Web Check-in
          </h1>
          <p className="text-xl text-gray-600">
            Howard Johnson Merlo
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-6 mb-8">
          <p className="text-lg text-gray-700 mb-4">
            El web check-in te permite completar tu registro antes de llegar al hotel.
          </p>
          <ul className="text-left space-y-3 text-gray-600">
            <li className="flex items-start">
              <span className="text-hj-orange mr-2">✓</span>
              <span>Evitá esperas en recepción</span>
            </li>
            <li className="flex items-start">
              <span className="text-hj-orange mr-2">✓</span>
              <span>Completá en menos de 3 minutos</span>
            </li>
            <li className="flex items-start">
              <span className="text-hj-orange mr-2">✓</span>
              <span>100% seguro y privado</span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 border-l-4 border-hj-blue rounded p-4">
          <p className="text-sm text-gray-700">
            <strong className="text-hj-blue">¿Recibiste un link por email?</strong>
            <br />
            Hacé click en el link del email para comenzar tu check-in.
          </p>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            ¿Tenés dudas? Contactanos:{' '}
            <a href="tel:+5492227490000" className="text-hj-blue hover:underline">
              +54 9 2227 49-0000
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
