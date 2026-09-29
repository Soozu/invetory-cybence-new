export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] },
      colors: { brand: { 50: '#eef3ff', 100: '#dce8ff', 500: '#3768e9', 600: '#2458d9', 700: '#1c48b8' } },
      boxShadow: { card: '0 1px 3px rgba(20, 36, 67, .035), 0 10px 28px rgba(20, 36, 67, .025)' }
    }
  },
  plugins: []
}
