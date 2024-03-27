import { globalStyle, style } from '@vanilla-extract/css';

export const workspaceAndUserWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const workspaceWrapper = style({
  width: 0,
  flex: 1,
});

export const userInfoWrapper = style({
  flexShrink: 0,
  width: 'auto',
  height: 'auto',
  padding: '4px 0',
});

// TODO:
globalStyle(`button.${userInfoWrapper} > span`, {
  lineHeight: 0,
});
