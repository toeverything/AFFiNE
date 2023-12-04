import { style } from '@vanilla-extract/css';

export const popoverContent = style({
  minWidth: '180px',
  color: 'var(--affine-text-primary-color)',
  borderRadius: '8px',
  padding: '8px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: '400',
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
  boxShadow: 'var(--affine-menu-shadow)',
  userSelect: 'none',
});
