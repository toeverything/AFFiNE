import { style } from '@vanilla-extract/css';

export const root = style({
  position: 'relative',
  selectors: {
    '&.scrollable': {
      overflowY: 'auto',
    },
  },
});

export const groupHeader = style({
  zIndex: 1,
});

export const stickyGroupHeader = style({
  zIndex: 1,
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
});
export const scrollbar = style({
  zIndex: 1,
});

export const item = style({
  position: 'absolute',
});
