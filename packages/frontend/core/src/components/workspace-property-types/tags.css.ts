import { style } from '@vanilla-extract/css';

export const tagInlineEditor = style({
  width: '100%',
});

export const container = style({});

export const groupHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const groupHeaderIcon = style({
  width: 24,
  height: 24,
  fontSize: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const groupHeaderLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});
export const filterValueMenu = style({
  top: 'calc(var(--radix-popper-anchor-height) - 18px) !important',
});
export const moreTagsLabel = style({
  marginLeft: 4,
});
