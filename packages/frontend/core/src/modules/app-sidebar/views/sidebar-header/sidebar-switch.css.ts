import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const sidebarSwitchClip = style({
  position: 'relative',
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
    '&[data-notification=true]:after': {
      transform: 'scale(1)',
    },
  },
  ':after': {
    content: '""',
    position: 'absolute',
    left: '19.75px',
    top: '6.25px',
    zIndex: 2,
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    transform: 'scale(0)',
    transition: 'transform 0.3s ease',
    backgroundColor: cssVarV2('button/primary'),
  },
});

export const switchIcon = style({
  transition: 'clip-path 0.3s ease',
  clipPath:
    'path(evenodd, "M 0 0 L 24 0 L 24 24 L 0 24 L 0 0 M19 4.25C19 4.38807 19.1119 4.5 19.25 4.5C19.3881 4.5 19.5 4.38807 19.5 4.25C19.5 4.11193 19.3881 4 19.25 4C19.1119 4 19 4.11193 19 4.25Z")',

  selectors: {
    '&[data-notification=true]': {
      clipPath:
        'path(evenodd, "M 0 0 L 24 0 L 24 24 L 0 24 L 0 0 M23 5.25C23 7.59721 21.0972 9.5 18.75 9.5C16.4028 9.5 14.5 7.59721 14.5 5.25C14.5 2.90279 16.4028 1 18.75 1C21.0972 1 23 2.90279 23 5.25Z")',
    },
  },
});
