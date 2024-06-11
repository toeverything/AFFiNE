import { cssVar } from '@toeverything/theme';
import { createVar, keyframes, style } from '@vanilla-extract/css';

export const animationTimeout = createVar();
export const transformOrigin = createVar();

const contentShow = keyframes({
  from: {
    transform: 'scale(0.10)',
  },
  to: {
    transform: 'scale(1)',
  },
});
const contentHide = keyframes({
  to: {
    opacity: 0,
    transform: 'scale(0.10)',
  },
  from: {
    opacity: 1,
    transform: 'scale(1)',
  },
});

const fadeIn = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});

const fadeOut = keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});

const slideRight = keyframes({
  from: {
    transform: 'translateX(-200%)',
    opacity: 0,
  },
  to: {
    transform: 'translateX(0)',
    opacity: 1,
  },
});

const slideLeft = keyframes({
  from: {
    transform: 'translateX(0)',
    opacity: 1,
  },
  to: {
    transform: 'translateX(-200%)',
    opacity: 0,
  },
});

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: cssVar('zIndexModal'),
  backgroundColor: cssVar('black30'),
  opacity: 0,
  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animation: `${fadeIn} ${animationTimeout} ease-in-out`,
      animationFillMode: 'forwards',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animation: `${fadeOut} ${animationTimeout} ease-in-out`,
      animationFillMode: 'backwards',
    },
  },
});

export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: cssVar('zIndexModal'),
});

export const modalContentContainer = style({
  display: 'flex',
  alignItems: 'flex-start',
  width: '90%',
  height: '90%',
  maxWidth: 1248,
  willChange: 'transform, opacity',
  transformOrigin: transformOrigin,
  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animationFillMode: 'forwards',
      animationName: contentShow,
      animationDuration: animationTimeout,
      animationTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animationFillMode: 'forwards',
      animationName: contentHide,
      animationDuration: animationTimeout,
      animationTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)',
    },
  },
});

export const modalContent = style({
  flex: 1,
  height: '100%',
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: '0px 0px 0px 2.23px rgba(0, 0, 0, 0.08)',
  borderRadius: '8px',
  minHeight: 300,
  // :focus-visible will set outline
  outline: 'none',
  position: 'relative',
});

export const modalControls = style({
  flexShrink: 0,
  zIndex: -1,
  minWidth: '48px',
  padding: '8px 0 0 16px',
  opacity: 0,
  pointerEvents: 'auto',
  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animationName: slideRight,
      animationDuration: animationTimeout,
      animationFillMode: 'forwards',
      animationTimingFunction: 'ease-in-out',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animationName: slideLeft,
      animationDuration: animationTimeout,
      animationFillMode: 'forwards',
      animationTimingFunction: 'ease-in-out',
    },
  },
});
