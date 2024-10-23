import { style } from '@vanilla-extract/css';

export const pagesTab = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});
export const pagesTabContent = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
  padding: '16px 16px 8px 16px',
});

export const pageList = style({
  width: '100%',
});

export const ellipsis = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
