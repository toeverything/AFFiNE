import { style } from '@vanilla-extract/css';

export const checkboxStyle = style({
  width: '16px',
  height: '16px',
  borderRadius: '2px',
  border: '1px solid var(--affine-border-color)',
  cursor: 'pointer',
  position: 'absolute',
  left: '-24px',
  top: '18px',
  selectors: {
    '&:hover': {
      borderColor: 'var(--affine-border-color-hover)',
    },
    '&:checked': {
      backgroundColor: 'var(--affine-primary-color)',
      borderColor: 'var(--affine-primary-color)',
    },
  },
});
export const checkboxSelectAllStyle = style({
  width: '16px',
  height: '16px',
  borderRadius: '2px',
  border: '1px solid var(--affine-border-color)',
  cursor: 'pointer',
  position: 'absolute',
  left: '-24px',
  top: '18px',
  selectors: {
    '&:hover': {
      borderColor: 'var(--affine-border-color-hover)',
    },
    '&:checked': {
      backgroundColor: 'var(--affine-primary-color)',
      borderColor: 'var(--affine-primary-color)',
    },
  },
});
