import { style } from '@vanilla-extract/css';

export const sidebarSwitch = style({
  opacity: 0,
  display: 'none !important',
  overflow: 'hidden',
  pointerEvents: 'none',
  transition: 'all .3s ease-in-out',
  selectors: {
    '&[data-show=true]': {
      opacity: 1,
      display: 'inline-flex !important',
      width: '32px',
      flexShrink: 0,
      fontSize: '24px',
      pointerEvents: 'auto',
    },
  },
});
