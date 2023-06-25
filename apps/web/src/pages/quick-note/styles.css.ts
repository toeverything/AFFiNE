import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const root = style({
  background: 'var(--affine-background-primary-color)',
});

export const header = style({
  padding: '20px 40px',
  WebkitAppRegion: 'drag',
} as ComplexStyleRule);

export const title = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: 600,
});

export const footer = style({
  padding: '20px 40px',
  display: 'flex',
  justifyContent: 'flex-end',
});
