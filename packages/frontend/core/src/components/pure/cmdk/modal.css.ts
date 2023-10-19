import { keyframes, style } from '@vanilla-extract/css';

const contentShow = keyframes({
  from: { opacity: 0, transform: 'translateY(-2%) scale(0.96)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const contentHide = keyframes({
  to: { opacity: 0, transform: 'translateY(-2%) scale(0.96)' },
  from: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'transparent',
  zIndex: 'var(--affine-z-index-modal)',
});

export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 'var(--affine-z-index-modal)',
  padding: '13vh 16px 16px',
});

export const modalContent = style({
  width: 640,
  // height: 530,
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
  boxShadow: 'var(--affine-cmd-shadow)',
  borderRadius: '12px',
  maxWidth: 'calc(100vw - 50px)',
  minWidth: 480,
  // minHeight: 420,
  // :focus-visible will set outline
  outline: 'none',
  position: 'relative',
  zIndex: 'var(--affine-z-index-modal)',
  willChange: 'transform, opacity',

  selectors: {
    '&[data-state=entered], &[data-state=entering]': {
      animation: `${contentShow} 120ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
    '&[data-state=exited], &[data-state=exiting]': {
      animation: `${contentHide} 120ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
  },
});
