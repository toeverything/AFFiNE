import { style } from '@vanilla-extract/css';

export const group = style({
  width: '100%',
  position: 'absolute',
  top: '1.2%',
  display: 'flex',
  gap: '24px',
  justifyContent: 'right',
  paddingRight: '6%',
  zIndex: 2,
});
export const buttonContainer = style({
  boxShadow: 'var(--affine-float-button-shadow-2)',
  borderRadius: '8px',
});
