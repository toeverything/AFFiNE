import { style } from '@vanilla-extract/css';

export const workspaceAndUserWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  width: 'calc(100% + 12px)',
  height: 42,
  paddingRight: 6,
  alignSelf: 'center',
});
export const quickSearchAndNewPage = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  marginLeft: -8,
  marginRight: -6,
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
