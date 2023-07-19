import { globalStyle, style } from '@vanilla-extract/css';

export const authModalContent = style({
  marginTop: '30px',
});

export const authMessage = style({
  marginTop: '30px',
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: 1.5,
});
globalStyle(`${authMessage} a`, {
  color: 'var(--affine-link-color)',
});
