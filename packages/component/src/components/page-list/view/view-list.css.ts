import { style } from '@vanilla-extract/css';

export const filterButton = style({
  borderRadius: '8px',
  height: '100%',
  padding: '4px 8px',
  fontSize: 'var(--affine-font-xs)',
  background: 'var(--affine-hover-color)',
  color: 'var(--affine-text-secondary-color)',
  border: '1px solid var(--affine-border-color)',
  transition: 'margin-left 0.2s ease-in-out',
  ':hover': {
    borderColor: 'var(--affine-border-color)',
  },
});
export const filterButtonCollapse = style({
  marginLeft: '20px',
});
export const viewDivider = style({
  '::after': {
    content: '""',
    display: 'block',
    width: '100%',
    height: '1px',
    background: 'var(--affine-border-color)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    margin: '0 1px',
  },
});
