import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Brand — amber (existing)
        brand: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Semantic — success (emerald)
        success: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // Semantic — warning (amber, distinct shade ramp from brand)
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Semantic — danger (rose)
        danger: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
          950: '#4c0519',
        },
        // Semantic — info (sky)
        info: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
      boxShadow: {
        // Refined SaaS elevation — subtle, layered
        'elev-1': '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px -1px rgb(0 0 0 / 0.04)',
        'elev-2': '0 2px 4px -2px rgb(0 0 0 / 0.06), 0 4px 6px -1px rgb(0 0 0 / 0.06)',
        'elev-3': '0 4px 6px -4px rgb(0 0 0 / 0.08), 0 10px 15px -3px rgb(0 0 0 / 0.08)',
        'elev-4': '0 8px 10px -6px rgb(0 0 0 / 0.10), 0 20px 25px -5px rgb(0 0 0 / 0.10)',
        // Inset focus — used on focused inputs
        'focus-ring': '0 0 0 3px rgb(245 158 11 / 0.20)',
        'focus-ring-danger': '0 0 0 3px rgb(244 63 94 / 0.20)',
      },
      borderRadius: {
        // Refined scale — slightly larger than default for modern feel
        'xs': '0.25rem',  // 4px
        'sm': '0.375rem', // 6px
        'md': '0.5rem',   // 8px (default)
        'lg': '0.75rem',  // 12px
        'xl': '1rem',     // 16px
        '2xl': '1.25rem', // 20px
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quint': 'cubic-bezier(0.83, 0, 0.17, 1)',
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-in-up': 'fade-in-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
