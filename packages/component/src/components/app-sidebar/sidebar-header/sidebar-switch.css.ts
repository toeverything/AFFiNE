import { style } from '@vanilla-extract/css';

export const sidebarSwitch = style({
  opacity: 0,
  width: 0,
  overflow: 'hidden',
  transition: 'opacity .3s ease-in-out',
  selectors: {
    '&[data-show=true]': {
      opacity: 1,
      width: 'auto',
    },
  },
});
