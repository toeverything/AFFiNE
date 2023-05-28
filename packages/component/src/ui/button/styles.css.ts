import { style } from '@vanilla-extract/css';

export const dropdownBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--affine-text-primary-color)',
  fontWeight: 600,
  background: 'var(--affine-button-gray-color)',
  boxShadow: 'var(--affine-float-button-shadow)',
  borderRadius: '8px',
  fontSize: 'var(--affine-font-sm)',
  // width: '100%',
  height: '32px',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const children = style({
  paddingLeft: '10px',
  paddingRight: '4px',
});

export const divider = style({
  width: '0.5px',
  height: '16px',
  background: 'var(--affine-border-color)',
});

export const ArrowDownBox = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: '4px',
  paddingRight: '10px',
});

export const icon = style({
  borderRadius: '4px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});
