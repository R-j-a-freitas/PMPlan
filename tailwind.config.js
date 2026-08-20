/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Paleta da marca — o azul que já era o primário da app, promovido a escala
      // nomeada para deixar de haver `blue-600` espalhado à mão (e para o dia em que
      // a cor mudar ser uma alteração num sítio só).
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        // Elevação em três degraus e só três: superfície (cartões), flutuante
        // (dropdowns/toasts) e modal. Mais níveis do que isto não se distinguem.
        card: '0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px 0 rgb(16 24 40 / 0.04)',
        float: '0 4px 12px -2px rgb(16 24 40 / 0.10), 0 2px 6px -2px rgb(16 24 40 / 0.06)',
        modal: '0 24px 48px -12px rgb(16 24 40 / 0.25)',
      },
    },
  },
  plugins: [],
};
