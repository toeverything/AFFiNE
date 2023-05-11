import { style } from '@vanilla-extract/css';

export const root = style({
  fontSize: 'var(--affine-font-xs)',
  height: '16px',
  userSelect: 'none',
  marginTop: '12px',
});

export const label = style({
  color: 'var(--affine-black-30)',
});
