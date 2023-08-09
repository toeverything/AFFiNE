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
globalStyle(`${authMessage} .link`, {
  cursor: 'pointer',
  color: 'var(--affine-link-color)',
});

export const forgetPasswordButton = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
  position: 'absolute',
  right: 0,
  bottom: 0,
  display: 'none',
});
