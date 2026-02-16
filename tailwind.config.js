/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    // Ограничиваемся исходниками проекта и не задеваем node_modules
    './**/*.{js,jsx,ts,tsx}',
    '!./node_modules/**',
  ],
  theme: {
    extend: {
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
      colors: { slate: { 950: '#020617' } },
    },
  },
  plugins: [],
};
