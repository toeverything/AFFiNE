import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  overflow: 'auto',
  height: '100%',
  paddingBottom: '32px',
});

export const favoriteCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexShrink: 0,
  opacity: 0,
  selectors: {
    [`&[data-favorite]`]: {
      opacity: 1,
    },
  },
});

globalStyle(`[data-testid="page-list-item"]:hover ${favoriteCell}`, {
  opacity: 1,
});
