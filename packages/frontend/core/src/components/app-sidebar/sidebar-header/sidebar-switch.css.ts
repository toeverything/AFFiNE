import { style } from '@vanilla-extract/css';

export const sidebarSwitchClip = style({
  flexShrink: 0,
  overflow: 'hidden',
  transition:
    'max-width 0.2s ease-in-out, margin 0.3s ease-in-out, opacity 0.3s ease',
  selectors: {
    '&[data-show=true]': {
      opacity: 1,
      maxWidth: '60px',
    },
    '&[data-show=false]': {
      opacity: 0,
      maxWidth: 0,
    },
  },
});
