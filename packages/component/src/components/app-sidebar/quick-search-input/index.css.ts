import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  background: 'var(--affine-white-10)',
  alignItems: 'center',
  borderRadius: '8px',
  border: '1px solid var(--affine-black-10)',
  fontSize: 'var(--affine-font-sm)',
  width: '100%',
  height: '36px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px',
  margin: '12px 0',
  position: 'relative',
});

export const icon = style({
  marginRight: '14px',
  color: 'var(--affine-icon-color)',
  fontSize: '20px',
});

export const spacer = style({
  flex: 1,
});

export const shortcutHint = style({
  color: 'var(--affine-black-30)',
  fontSize: 'var(--affine-font-base)',
});
