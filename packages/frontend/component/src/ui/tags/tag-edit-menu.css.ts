import { globalStyle, style } from '@vanilla-extract/css';

export const menuItemListScrollable = style({});

export const menuItemListScrollbar = style({
  transform: 'translateX(4px)',
});

export const menuItemList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 200,
  overflow: 'auto',
});

globalStyle(`${menuItemList}[data-radix-scroll-area-viewport] > div`, {
  display: 'table !important',
});

export const tagColorIconWrapper = style({
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const tagColorIcon = style({
  width: 16,
  height: 16,
  borderRadius: '50%',
});
