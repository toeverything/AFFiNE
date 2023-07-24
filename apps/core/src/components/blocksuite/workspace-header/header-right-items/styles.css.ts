import { style } from '@vanilla-extract/css';

export const group = style({
  width: '100%',
  position: 'absolute',
  bottom: '100px',
  left: '0',
  display: 'flex',
  gap: '24px',
  justifyContent: 'center',
});
export const buttonContainer = style({
  boxShadow: 'var(--affine-float-button-shadow-2)',
  borderRadius: '8px',
});
