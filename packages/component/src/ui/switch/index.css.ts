import { style } from '@vanilla-extract/css';

export const labelStyle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
});
export const inputStyle = style({
  opacity: 0,
  position: 'absolute',
});
export const switchStyle = style({
  position: 'relative',
  width: '46px',
  height: '26px',
  background: 'var(--affine-icon-color)',
  borderRadius: '37px',
  transition: '200ms all',
  border: '1px solid var(--affine-black-10)',
  boxShadow: 'var(--affine-toggle-circle-shadow)',
  selectors: {
    '&:before': {
      transition: 'all .2s cubic-bezier(0.27, 0.2, 0.25, 1.51)',
      content: '""',
      position: 'absolute',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      top: '50%',
      border: '1px solid var(--affine-black-10)',
      background: 'var(--affine-white)',
      transform: 'translate(1px, -50%)',
    },
  },
});
export const switchCheckedStyle = style({
  background: 'var(--affine-primary-color)',
  selectors: {
    '&:before': {
      background: 'var(--affine-toggle-circle-background-color)',
      transform: 'translate(21px,-50%)',
    },
  },
});
