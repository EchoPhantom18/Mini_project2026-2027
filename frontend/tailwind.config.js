/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safe: '#10b981',
        moderate: '#f59e0b',
        high: '#f97316',
        critical: '#ef4444'
      }
    },
  },
  plugins: [],
}
