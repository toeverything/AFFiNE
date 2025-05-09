import { style } from '@vanilla-extract/css';

export const menuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const menuItemIcon = style({});
export const menuItemText = style({
  fontSize: 14,
  width: 0,
  flex: 1,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});
export const menuTrigger = style({
  width: 250,
});
