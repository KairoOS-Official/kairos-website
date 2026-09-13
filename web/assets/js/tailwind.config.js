/**
 * KaïroOS — Configuration Tailwind Centralisée
 * Inspirée du Design System "Luminous Editorial Tech"
 */
window.tailwindConfig = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Palette Principale KaïroOS
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#1e40af',
          900: '#1e1b4b',
        },
        coral: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        // Tokens de Surface & Typographie Luminous Tech
        canvas: '#FBFBF9',
        surface: '#FFFFFF',
        'surface-dim': '#d8dadf',
        'surface-bright': '#f8f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f2f3f9',
        'surface-container': '#eceef3',
        'surface-container-high': '#e6e8ee',
        'surface-container-highest': '#e1e2e8',
        heading: '#0F172A',
        body: '#475569',
        muted: '#64748B',
        'on-surface': '#191c20',
        'on-surface-variant': '#444653',
        'inverse-surface': '#2e3135',
        'inverse-on-surface': '#eff0f6',
        outline: '#757684',
        'outline-variant': '#c4c5d5',
        primary: '#00288e',
        'on-primary': '#ffffff',
        'primary-container': '#1e40af',
        'on-primary-container': '#a8b8ff',
        'primary-fixed': '#dde1ff',
        'primary-fixed-dim': '#b8c4ff',
        'on-primary-fixed': '#001453',
        secondary: '#b90538',
        'on-secondary': '#ffffff',
        'secondary-container': '#dc2c4f',
        'secondary-fixed': '#ffdadb',
        'secondary-fixed-dim': '#ffb2b7',
        tertiary: '#003c36',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#00554e',
        'on-tertiary-container': '#5fcdbf',
        'tertiary-fixed': '#89f5e7',
        'tertiary-fixed-dim': '#6bd8cb',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 2px 10px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.04)',
        'card': '0 20px 40px -15px rgba(0,0,0,0.05), 0 0 1px 1px rgba(0,0,0,0.04)',
        'float': '0 30px 60px -12px rgba(15,23,42,0.08)',
        'glow': '0 0 25px -5px rgba(99, 102, 241, 0.3)',
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.75rem',
        'space-xl': '3rem',
        'gutter': '1.5rem',
        'gutter-sm': '1rem',
        'margin': '3rem',
        'margin-sm': '1.25rem',
      }
    }
  }
};
if (typeof tailwind !== 'undefined') {
  tailwind.config = window.tailwindConfig;
}
