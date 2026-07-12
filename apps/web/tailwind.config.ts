import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Guri design language (CLAUDE.md): Forest #173A31, Lime #B7F35D (primary CTA
// only — Forest text on Lime), Mist #F4F7F2 background, Slate #5C6B64
// secondary, Amber #F2A93B reserved status. Pill buttons, 20px card radius.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        forest: '#173A31',
        lime: '#B7F35D',
        mist: '#F4F7F2',
        slate_brand: '#5C6B64',
        amber_reserved: '#F2A93B',
      },
      borderRadius: {
        card: '20px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [animate],
};

export default config;
