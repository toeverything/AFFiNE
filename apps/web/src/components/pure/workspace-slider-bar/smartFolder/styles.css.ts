import { style } from '@vanilla-extract/css';

export const wrapper = style({
  userSelect: 'none',
  // marginLeft:8,
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});
export const view = style({
  display: 'flex',
  alignItems: 'center',
});
export const viewTitle = style({
  display: 'flex',
  alignItems: 'center',
});
export const title = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const more = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  padding: 4,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const deleteFolder = style({
  color: 'var(--affine-warning-color)',
  ':hover': {
    backgroundColor: 'var(--affine-background-warning-color)',
  },
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: 'var(--affine-border-color)',
});
