import { style } from '@vanilla-extract/css';

export const headerMenuTrigger = style({
  selectors: {
    '&[data-state=open], &:hover': {
      backgroundColor: 'var(--affine-hover-color)',
    },
  },
});
