import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: ['attribute', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          300: 'var(--color-primary-300)',
          500: 'var(--color-primary-500)',
          700: 'var(--color-primary-700)',
          900: 'var(--color-primary-900)',
        },
        accent:     'var(--color-accent)',
        background: 'var(--color-background)',
        surface:    'var(--color-surface)',
        border:     'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-muted':   'var(--color-text-muted)',
        state: {
          running:   'var(--color-state-running)',
          stopped:   'var(--color-state-stopped)',
          error:     'var(--color-state-error)',
          deploying: 'var(--color-state-deploying)',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        body:    'var(--font-body)',
        mono:    'var(--font-body)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        soft:     'var(--shadow-soft)',
        dramatic: 'var(--shadow-dramatic)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        default: 'var(--ease-default)',
        spring:  'var(--ease-spring)',
      },
      spacing: {
        1:  'var(--space-1)',
        2:  'var(--space-2)',
        3:  'var(--space-3)',
        4:  'var(--space-4)',
        6:  'var(--space-6)',
        8:  'var(--space-8)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
    },
  },
} satisfies Config
