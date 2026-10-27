// Tailwind config for the design-system stylesheet: the app's theme from
// packages/frontend/tailwind.config.js, with colours, radii, shadows and fonts read from the
// system's tokens.css variables (full colours) instead of the app's bare HSL channels.
const path = require('node:path');

const repo = path.resolve(__dirname, '../../..');
const ui = (file) => path.join(repo, 'packages/frontend/src/components', file);
const c = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

module.exports = {
  content: [
    ui('ui/*.tsx'),
    ui('layout/PageActionHeader.tsx'),
    ui('layout/AppToaster.tsx'),
    ui('portfolio/CollapsibleCard.tsx'),
    path.join(__dirname, '../content/components/*/preview.html'),
  ],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      colors: {
        border: c('border'),
        input: c('input'),
        ring: c('ring'),
        background: c('background'),
        foreground: c('foreground'),
        primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        card: { DEFAULT: c('card'), foreground: c('card-foreground') },
        profit: c('profit'),
        loss: c('loss'),
        warning: c('warning'),
        info: c('info'),
        crypto: c('accent-crypto'),
        equities: c('accent-equities'),
        cash: c('accent-cash'),
        custody: c('accent-custody'),
        macro: c('accent-macro'),
      },
      borderRadius: { lg: 'var(--radius-lg)', md: 'var(--radius-md)', sm: 'var(--radius-sm)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.15s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
