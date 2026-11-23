import { style } from '@vanilla-extract/css';

export const placeholder = style({
  display: 'none',
  selectors: {
    '&:only-child': {
      display: 'initial',
    },
  },
});
