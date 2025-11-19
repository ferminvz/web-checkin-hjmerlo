/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Gotham', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        'hj-blue': {
          DEFAULT: '#0057A0',
          dark: '#004080',
          light: '#0070CC',
        },
        'hj-orange': {
          DEFAULT: '#FF6B35',
          dark: '#E55A24',
        },
      },
    },
  },
  plugins: [],
}
