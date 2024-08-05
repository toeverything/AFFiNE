import { style } from '@vanilla-extract/css';

const top = 256 - 52; // 52 is the height of the header
const bottom = 76;

export const root = style({
  position: 'absolute',
  top,
  right: 22,
  maxHeight: `calc(100% - ${top}px - ${bottom}px)`,
  display: 'flex',
  '@container': {
    '(width <= 640px)': {
      display: 'none',
    },
  },
});
