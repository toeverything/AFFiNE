import { style } from '@vanilla-extract/css';

export const container = style({
  position: 'relative',
  selectors: {
    '&[data-collapsed="false"]:after': {
      display: 'block',
      content: '""',
      position: 'absolute',
      left: '-8px',
      top: '0',
      width: '6px',
      height: '100%',
      background:
        'repeating-linear-gradient(30deg, #F5CC47, #F5CC47 8px, #000000 8px, #000000 14px)',
    },
  },
});

export const descriptionHighlight = style({
  fontWeight: 'bold',
});
