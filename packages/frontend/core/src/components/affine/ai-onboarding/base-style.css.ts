import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const dialogOverlay = style({
  background: `linear-gradient(95deg, transparent 0px, ${cssVar('backgroundPrimaryColor')} 400px)`,
});

export const slideTransition = style({
  transition: 'all 0.3s',

  selectors: {
    '&.preEnter, &.exiting': {
      opacity: 0,
      position: 'absolute',
    },
    '&.preEnter.left, &.exiting.left': {
      transform: 'translateX(-100%)',
    },
    '&.preEnter.right, &.exiting.right': {
      transform: 'translateX(100%)',
    },
    '&.exited:not([data-force-render="true"])': {
      display: 'none',
    },
    '&.exited[data-force-render="true"]': {
      visibility: 'hidden',
    },
  },
});
