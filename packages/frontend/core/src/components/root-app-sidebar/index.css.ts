import { style } from '@vanilla-extract/css';

export const workspaceAndUserWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});
export const quickSearchAndNewPage = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 0',
  marginLeft: -8,
});
export const quickSearch = style({
  width: 0,
  flex: 1,
});

export const workspaceWrapper = style({
  width: 0,
  flex: 1,
});

export const bottomContainer = style({
  gap: 8,
});
