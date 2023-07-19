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
  background: 'var(--affine-white)',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '6px',
});
