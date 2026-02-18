/** @type {import('tailwindcss').Config} */
const { baseTheme, themeToVar } = require('@toeverything/theme');

const themeVar = (key, fallback) =>
  `var(${themeToVar(key)}${fallback ? `, ${fallback}` : ''})`;

module.exports = {
  darkMode: ['class'],
  // Keep both roots so class scanning works in monorepo-root and package-root runs.
  content: [
    './src/**/*.{ts,tsx}',
    './packages/frontend/admin/src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: themeVar('fontFamily', baseTheme.fontFamily),
        mono: themeVar('fontCodeFamily', baseTheme.fontCodeFamily),
      },
      fontSize: {
        xxs: '11px',
        base: themeVar('fontBase', baseTheme.fontBase),
        sm: themeVar('fontSm', baseTheme.fontSm),
        xs: themeVar('fontXs', baseTheme.fontXs),
      },
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        // Selfhost sidebar tokens
        sidebar: {
          bg: 'var(--affine-v2-selfhost-layer-background-sidebarBg-sidebarBg)',
          foreground: 'var(--affine-v2-selfhost-text-sidebar-primary)',
          'foreground-secondary':
            'var(--affine-v2-selfhost-text-sidebar-secondary)',
          hover: 'var(--affine-v2-selfhost-button-sidebarButton-bg-hover)',
          active: 'var(--affine-v2-selfhost-button-sidebarButton-bg-select)',
        },
        // Chip / badge tokens
        chip: {
          blue: 'var(--affine-v2-chip-label-blue)',
          white: 'var(--affine-v2-chip-label-white)',
          text: 'var(--affine-v2-chip-label-text)',
        },
        // Toggle tokens
        toggle: {
          on: 'var(--affine-v2-selfhost-toggle-backgroundOn)',
          off: 'var(--affine-v2-selfhost-toggle-backgroundOff)',
          thumb: 'var(--affine-v2-selfhost-toggle-foreground)',
        },
      },
      borderRadius: {
        lg: `var(--radius, ${themeVar('popoverRadius')})`,
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      spacing: {
        paragraph: themeVar('paragraphSpace', baseTheme.paragraphSpace),
      },
      boxShadow: {
        menu: themeVar('menuShadow'),
        overlay: themeVar('overlayShadow'),
        1: themeVar('shadow1'),
        2: themeVar('shadow2'),
        3: themeVar('shadow3'),
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
