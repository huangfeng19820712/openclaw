/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{vue,js,ts,html}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366F1',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        'bg-dark': '#0F172A',
        'card-dark': '#1E293B',
        'text-light': '#F8FAFC',
      },
    },
  },
  plugins: [],
};
