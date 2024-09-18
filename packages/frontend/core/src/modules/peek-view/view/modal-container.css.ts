import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: cssVar('zIndexModal'),
  backgroundColor: cssVarV2('layer/background/modal'),
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
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  '@media': {
    // mobile:
    'screen and (width <= 640px)': {
      selectors: {
        [`${modalContentWrapper}:is([data-mode="max"], [data-mode="fit"]) &`]: {
          height: '60%',
          width: 'calc(100% - 32px)',
          paddingRight: 0,
          paddingBottom: 32,
          alignSelf: 'flex-end',
        },
      },
    },
  },
  selectors: {
    [`${modalContentWrapper}[data-mode="max"] &`]: {
      width: 'calc(100% - 64px)',
      height: 'calc(100% - 64px)',
      paddingRight: 48,
    },
    [`${modalContentWrapper}[data-mode="full"] &`]: {
      width: '100%',
      height: '100%',
    },
    [`${modalContentWrapper}[data-mode="fit"] &`]: {
      width: '90%',
      height: '90%',
      paddingRight: 48,
      maxWidth: 1248,
    },
    '&[data-anime-state="animating"]': {
      opacity: 0,
    },
  },
});
export const modalContentClip = style({
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
  overflow: 'hidden',
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
  right: 0,
  top: 0,
  zIndex: -1,
  minWidth: '48px',
  padding: '8px 0 0 16px',
  pointerEvents: 'auto',
  '@media': {
    'screen and (width <= 640px)': {
      top: -48,
    },
  },
});
