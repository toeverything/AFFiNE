import { keyframes, style } from '@vanilla-extract/css';

const slideDown = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-10px)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

const slideUp = keyframes({
  to: {
    opacity: 0,
    transform: 'translateY(-10px)',
  },
  from: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

export const contentAnimation = style({
  animation: `${slideDown} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
  selectors: {
    '&[data-state="closed"]': {
      pointerEvents: 'none',
      animation: `${slideUp} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
  },
});
