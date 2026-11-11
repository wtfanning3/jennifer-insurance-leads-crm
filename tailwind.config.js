/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Taken from the agency logo
        navy: { DEFAULT: '#0B2F86', light: '#2A4FA8', dark: '#071F5C' },
        sky: { DEFAULT: '#B8CDF3', light: '#E6EEFC' },
        crimson: { DEFAULT: '#C8102E', dark: '#9E0B24' },
        ink: '#1F2430',
        muted: '#667085',
        line: '#E4E7EC',
        canvas: '#F7F8FB',
        success: '#2E7D4F',
        warn: '#B7791F',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
