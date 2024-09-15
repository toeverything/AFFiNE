import { globalStyle, style } from '@vanilla-extract/css';

export const recentSection = style({
  paddingBottom: 32,
  selectors: {
    '&[data-state="open"]': {
      paddingBottom: 0,
    },
  },
});
export const scroll = style({
  width: '100%',
  paddingTop: 8,
  paddingBottom: 32,
  overflowX: 'auto',
});

export const list = style({
  paddingLeft: 16,
  paddingRight: 16,
  display: 'flex',
  gap: 10,
  width: 'fit-content',
});

export const cardWrapper = style({
  width: 172,
  height: 210,
  flexShrink: 0,
});

export const header = style({
  margin: '0 8px',
});

globalStyle(`${cardWrapper} > *`, {
  width: '100%',
  height: '100%',
});
