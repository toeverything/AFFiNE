import { style } from '@vanilla-extract/css';
export const leftContentText = style({
  fontSize: 'var(--affine-font-base)',
  fontWeight: 400,
  lineHeight: '1.6',
  maxWidth: '548px',
});

export const mail = style({
  color: 'var(--affine-link-color)',
  textDecoration: 'none',
  ':visited': {
    color: 'var(--affine-link-color)',
  },
});
