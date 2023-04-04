import { style } from '@vanilla-extract/css';

export const root = style({
  width: '42px',
  height: '25px',
  backgroundColor: 'blue',
  position: 'relative',
});

export const thump = style({
  display: 'block',
  width: '20px',
  height: '20px',
  backgroundColor: 'white',
  selectors: {
    '[data-state="checked"] &': {
      transform: 'translateX(17px)',
    },
  },
});
