import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  createVar,
  generateIdentifier,
  globalStyle,
  keyframes,
  style,
} from '@vanilla-extract/css';

import { vtScopeSelector } from '../../utils/view-transition';
export const widthVar = createVar('widthVar');
export const heightVar = createVar('heightVar');
export const minHeightVar = createVar('minHeightVar');

export const modalVTScope = generateIdentifier('modal');

const overlayShow = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
const contentShowFadeScaleTop = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});
const contentHideFadeScaleTop = keyframes({
  to: {
    opacity: 0,
    transform: 'translateY(-2%) scale(0.96)',
  },
  from: {
    opacity: 1,
    transform: 'translateY(0) scale(1)',
  },
});
const contentShowSlideBottom = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});
const contentHideSlideBottom = keyframes({
  from: { transform: 'translateY(0)' },
  to: { transform: 'translateY(100%)' },
});
const modalContentViewTransitionNameFadeScaleTop = generateIdentifier(
  'modal-content-fade-scale-top'
);
const modalContentViewTransitionNameSlideBottom = generateIdentifier(
  'modal-content-slide-bottom'
);
export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: cssVar('backgroundModalColor'),
  zIndex: cssVar('zIndexModal'),
  animation: `${overlayShow} 150ms forwards`,
  selectors: {
    '&.anim-none': {
      animation: 'none',
    },
    '&.mobile': {
      backgroundColor: cssVarV2('layer/mobile/modal'),
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
  '@media': {
    'screen and (width <= 640px)': {
      // todo: adjust animation
      alignItems: 'flex-end',
      paddingBottom: 'env(safe-area-inset-bottom, 20px)',
    },
  },

  selectors: {
    '&[data-full-screen="true"]': {
      padding: '0 !important',
    },
    '&.anim-none': {
      animation: 'none',
    },
    '&.anim-fadeScaleTop': {
      animation: `${contentShowFadeScaleTop} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
    [`${vtScopeSelector(modalVTScope)} &.anim-fadeScaleTop.vt-active`]: {
      viewTransitionName: modalContentViewTransitionNameFadeScaleTop,
    },
    '&.anim-slideBottom': {
      animation: `${contentShowSlideBottom} 0.23s ease`,
      animationFillMode: 'forwards',
    },
    [`${vtScopeSelector(modalVTScope)} &.anim-slideBottom.vt-active`]: {
      viewTransitionName: modalContentViewTransitionNameSlideBottom,
    },
  },
});
globalStyle(
  `::view-transition-old(${modalContentViewTransitionNameFadeScaleTop})`,
  {
    animation: `${contentHideFadeScaleTop} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
    animationFillMode: 'forwards',
  }
);
globalStyle(
  `::view-transition-old(${modalContentViewTransitionNameSlideBottom})`,
  {
    animation: `${contentHideSlideBottom} 0.23s ease`,
    animationFillMode: 'forwards',
  }
);

export const modalContent = style({
  vars: {
    [widthVar]: '',
    [heightVar]: '',
    [minHeightVar]: '',
  },
  width: widthVar,
  height: heightVar,
  minHeight: minHeightVar,
  maxHeight: 'calc(100vh - 32px)',
  maxWidth: 'calc(100vw - 20px)',
  boxSizing: 'border-box',
  fontSize: cssVar('fontBase'),
  fontWeight: '400',
  lineHeight: '1.6',
  padding: '20px 24px',
  position: 'relative',
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  boxShadow: cssVar('popoverShadow'),
  borderRadius: '12px',
  // :focus-visible will set outline
  outline: 'none',

  selectors: {
    '[data-full-screen="true"] &': {
      vars: {
        [widthVar]: '100vw',
        [heightVar]: '100vh',
        [minHeightVar]: '100vh',
      },
      maxWidth: '100vw',
      maxHeight: '100vh',
      borderRadius: 0,
    },
  },
});
export const closeButton = style({
  position: 'absolute',
  top: '22px',
  right: '20px',
  zIndex: cssVar('zIndexModal'),
});
export const modalHeader = style({
  fontSize: cssVar('fontH6'),
  fontWeight: '600',
  lineHeight: '1.45',
  marginBottom: '12px',
});
export const modalDescription = style({
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
});
export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: '40px',
  marginTop: 'auto',
  gap: '20px',
  selectors: {
    '&.modalFooterWithChildren': {
      paddingTop: '20px',
    },
    '&.reverse': {
      flexDirection: 'row-reverse',
      justifyContent: 'flex-start',
    },
  },
});
export const confirmModalContent = style({
  height: '100%',
  overflowY: 'auto',
  padding: '12px 4px 20px 4px',
});
export const confirmModalContainer = style({
  display: 'flex',
  flexDirection: 'column',
});

globalStyle(`[data-modal="false"]${modalContentWrapper}`, {
  pointerEvents: 'none',
});

globalStyle(`[data-modal="false"] ${modalContent}`, {
  pointerEvents: 'auto',
});

export const promptModalContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});
