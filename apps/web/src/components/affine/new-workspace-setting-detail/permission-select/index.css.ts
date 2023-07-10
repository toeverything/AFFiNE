import { style } from '@vanilla-extract/css';

export const trigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  padding: '0 8px',
});

export const content = style({
  zIndex: 'calc(var(--affine-z-index-modal) + 1)',
  overflow: 'hidden',
  background: 'white',
  borderRadius: '6px',
  boxShadow:
    '0px 10px 38px -10px rgba(22, 23, 24, 0.35), 0px 10px 20px -15px rgba(22, 23, 24, 0.2)',
});
