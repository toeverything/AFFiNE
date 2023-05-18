import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  background: 'var(--affine-white-30)',
  alignItems: 'center',
  borderRadius: '8px',
  border: '1px solid var(--affine-black-10)',
  fontSize: 'var(--affine-font-sm)',
  width: '100%',
  position: 'relative',
  height: '52px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 24px',
  transition: 'background 0.2s ease',
  selectors: {
    '&:active': {
      background: 'var(--affine-white-40)',
    },
  },
});

export const icon = style({
  marginRight: '18px',
  color: 'var(--affine-icon-color)',
  fontSize: '24px',
});

export const spacer = style({
  flex: 1,
});
