import { keyframes, style } from '@vanilla-extract/css';

const contentShow = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, -48%) scale(0.96)' },
  to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
});

const contentHide = keyframes({
  to: { opacity: 0, transform: 'translate(-50%, -48%) scale(0.96)' },
  from: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
});

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'transparent',
  zIndex: 'var(--affine-z-index-modal)',
});

export const modalContent = style({
  width: 640,
  // height: 530,
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
  boxShadow: 'var(--affine-cmd-shadow)',
  borderRadius: '12px',
  maxWidth: 'calc(100vw - 50px)',
  maxHeight: 'calc(100vh - 110px)',
  minWidth: 480,
  // minHeight: 420,
  // :focus-visible will set outline
  outline: 'none',
  position: 'fixed',
  zIndex: 'var(--affine-z-index-modal)',
  top: 'calc(50% + 25px)',
  left: '50%',

  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animation: `${contentShow} 120ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animation: `${contentHide} 120ms cubic-bezier(0.42, 0, 0.58, 1)`,
    },
  },
});
