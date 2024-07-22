import { cssVar } from '@toeverything/theme';
import { createVar, keyframes, style } from '@vanilla-extract/css';

export const animationTimeout = createVar();

const contentShow = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
const contentHide = keyframes({
  to: {
    opacity: 0,
  },
  from: {
    opacity: 1,
  },
});

export const overlay = style({
  selectors: {
    '&.entered, &.entering': {
      animation: `${contentShow} ${animationTimeout} forwards`,
    },
    '&.exited, &.exiting': {
      animation: `${contentHide} ${animationTimeout} forwards`,
    },
  },
});

export const container = style([
  overlay,
  {
    maxWidth: 480,
    minWidth: 360,
    padding: '20px 0',
    alignSelf: 'start',
    marginTop: '120px',
  },
]);

export const titleContainer = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
});

export const titleStyle = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
});

export const rowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  padding: 6,
  width: '160px',
});

export const viewport = style({
  maxHeight: 'calc(100vh - 220px)',
  padding: '0 24px',
});

export const scrollBar = style({
  width: 6,
  transform: 'translateX(-4px)',
});

export const hiddenInput = style({
  width: '0',
  height: '0',
  position: 'absolute',
});
