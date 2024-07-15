import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: cssVar('zIndexModal'),
  backgroundColor: cssVar('black30'),
  pointerEvents: 'auto',
  selectors: {
    '&[data-anime-state="animating"]': {
      opacity: 0,
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
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  selectors: {
    '[data-padding="true"] &': {
      width: '90%',
      height: '90%',
      maxWidth: 1248,
    },
    '&[data-anime-state="animating"]': {
      opacity: 0,
    },
  },
});

export const dialog = style({
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('shadow3'),
});

export const modalContent = style({
  borderRadius: 'inherit',
  width: '100%',
  height: '100%',
  flexShrink: 0,
  overflow: 'hidden',
  minHeight: 300,
  // :focus-visible will set outline
  outline: 'none',
  position: 'relative',
  selectors: {
    '&[data-no-interaction=true]': {
      pointerEvents: 'none',
    },
  },
});

export const modalControls = style({
  position: 'absolute',
  left: '100%',
  top: 0,
  zIndex: -1,
  minWidth: '48px',
  padding: '8px 0 0 16px',
  pointerEvents: 'auto',
});
