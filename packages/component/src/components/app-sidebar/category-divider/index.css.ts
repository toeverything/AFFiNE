import { style } from '@vanilla-extract/css';

export const root = style({
  fontSize: 'var(--affine-font-xs)',
  height: '16px',
  userSelect: 'none',
  padding: '0 16px',
  marginTop: '20px',
});

export const label = style({
  color: 'var(--affine-black-30)',
});
