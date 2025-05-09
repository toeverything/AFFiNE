import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const menuContent = style({
  width: 280,
  paddingRight: 0,
});
export const scrollableViewport = style({
  paddingRight: 8,
  maxHeight: 360,
});
export const emptyIcon = style({
  fontSize: 20,
  color: cssVarV2.icon.primary,
});
export const empty = style({
  pointerEvents: 'none',
  display: 'flex',
  gap: 8,
  justifyContent: 'space-between',
  alignItems: 'center',
  lineHeight: '20px',
  padding: 4,
});
export const emptyText = style({
  color: cssVarV2.text.secondary,
});
export const link = style({
  lineHeight: 0,
  pointerEvents: 'auto',
  fontSize: 20,
  color: cssVarV2.icon.primary,
});
export const space = style({
  width: 0,
  flex: 1,
});
