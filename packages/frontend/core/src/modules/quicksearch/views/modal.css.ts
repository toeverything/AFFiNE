import { cssVar } from '@toeverything/theme';
import { createVar, keyframes, style } from '@vanilla-extract/css';
const contentShow = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});
const contentHide = keyframes({
  to: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  from: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});
export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'transparent',
  zIndex: cssVar('zIndexModal'),
});
export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: cssVar('zIndexModal'),
  padding: '13vh 16px 16px',
});

export const animationTimeout = createVar();

export const modalContent = style({
  width: 640,
  // height: 530,
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('cmdShadow'),
  borderRadius: '12px',
  maxWidth: 'calc(100vw - 50px)',
  minWidth: 480,
  // minHeight: 420,
  // :focus-visible will set outline
  outline: 'none',
  position: 'relative',
  zIndex: cssVar('zIndexModal'),
  willChange: 'transform, opacity',
  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animation: `${contentShow} ${animationTimeout} cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animation: `${contentHide} ${animationTimeout} cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
  },
});
