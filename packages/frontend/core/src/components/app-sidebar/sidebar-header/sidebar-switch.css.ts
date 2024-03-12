import { style } from '@vanilla-extract/css';

export const sidebarSwitch = style({
  opacity: 0,
  display: 'inline-flex',
  overflow: 'hidden',
  pointerEvents: 'none',
  transition: 'max-width 0.2s ease-in-out, margin 0.3s ease-in-out',
  selectors: {
    '&[data-show=true]': {
      maxWidth: '32px',
      opacity: 1,
      width: '32px',
      flexShrink: 0,
      fontSize: '24px',
      pointerEvents: 'auto',
    },
    '&[data-show=false]': {
      maxWidth: 0,
      margin: '0 !important',
    },
  },
});
