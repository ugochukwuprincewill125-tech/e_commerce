import forms from '@tailwindcss/forms'

/**
 * Timeline design tokens.
 *
 * Design language: a professional electronics retailer. Structure comes from
 * hairline borders and typographic hierarchy, not from shadows, gradients or
 * oversized radii. Surfaces stay flat; elevation is used sparingly and only
 * where an element genuinely floats above the page (menus, drawers, modals).
 *
 * `ink` and `brand` are the only brand colours. Change the scale here and the
 * whole site follows.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2.5rem' },
      screens: { '2xl': '1320px' },
    },
    extend: {
      colors: {
        ink: {
          950: '#05080F',
          900: '#0A0F1C',
          800: '#10182B',
          700: '#18233A',
          600: '#24314D',
        },
        metal: {
          50: '#F6F7F9',
          100: '#ECEEF2',
          200: '#DADFE7',
          300: '#BCC3CF',
          400: '#8F99AA',
          500: '#6B7587',
          600: '#4F586A',
        },
        // Structural hairlines. Separated from `metal` so borders can be tuned
        // without shifting every grey surface.
        line: {
          DEFAULT: '#E4E7EC',
          soft: '#EFF1F4',
          strong: '#CFD5DE',
        },
        brand: {
          50: '#EEF3FF',
          100: '#DAE5FF',
          200: '#B8CCFF',
          300: '#8AAAFF',
          400: '#5A84FF',
          500: '#2F6BFF',
          600: '#1D55E0',
          700: '#1743B3',
          800: '#15398F',
          900: '#142F6F',
        },
        success: '#0E9F6E',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Sora', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      // Deliberately tight. Large radii read as consumer-app, not retail.
      borderRadius: {
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '14px',
      },
      boxShadow: {
        // Flat by default: borders carry the structure.
        card: '0 1px 2px 0 rgb(10 15 28 / 0.04)',
        lift: '0 8px 24px -8px rgb(10 15 28 / 0.12), 0 2px 6px -2px rgb(10 15 28 / 0.06)',
        // Reserved for overlays that genuinely float above the page.
        overlay: '0 24px 60px -16px rgb(10 15 28 / 0.24), 0 8px 20px -8px rgb(10 15 28 / 0.12)',
        // Kept for backwards compatibility; now a neutral hairline ring.
        glow: '0 0 0 1px rgb(10 15 28 / 0.08)',
      },
      fontSize: {
        // A compact editorial scale for section and page headings.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        display: ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.035em' }],
        'display-sm': ['2.625rem', { lineHeight: '1.08', letterSpacing: '-0.03em' }],
        'section-title': ['1.875rem', { lineHeight: '1.18', letterSpacing: '-0.022em' }],
      },
      letterSpacing: {
        tightest: '-0.035em',
        widest: '0.2em',
      },
      maxWidth: {
        measure: '40rem',
        'measure-sm': '32rem',
      },
      transitionDuration: {
        150: '150ms',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out both',
      },
    },
  },
  plugins: [forms],
}
