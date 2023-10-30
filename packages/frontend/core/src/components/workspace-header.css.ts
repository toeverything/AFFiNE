import { style } from '@vanilla-extract/css';

export const trashTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  fontWeight: 600,
});

export const trashIcon = style({
  color: 'var(--affine-icon-color)',
  fontSize: 'var(--affine-font-h-5)',
});
