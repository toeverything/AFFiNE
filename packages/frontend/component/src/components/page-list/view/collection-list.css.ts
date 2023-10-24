import { style } from '@vanilla-extract/css';

export const menuTitleStyle = style({
  marginLeft: '12px',
  marginTop: '10px',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: 'var(--affine-border-color)',
});
export const viewMenu = style({});
export const viewOption = style({
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 6,
  width: 24,
  height: 24,
  opacity: 0,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  selectors: {
    [`${viewMenu}:hover &`]: {
      opacity: 1,
    },
  },
});
export const filterMenuTrigger = style({
  padding: '6px 8px',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
