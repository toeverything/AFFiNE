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
export const keyboardInsetVar = createVar('keyboardInsetVar');

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
const contentShowSlideRight = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});
const contentHideSlideRight = keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: 'translateX(100%)' },
});
const modalContentViewTransitionNameFadeScaleTop = generateIdentifier(
  'modal-content-fade-scale-top'
);
const modalContentViewTransitionNameSlideBottom = generateIdentifier(
  'modal-content-slide-bottom'
);
const modalContentViewTransitionNameSlideRight = generateIdentifier(
  'modal-content-slide-right'
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
      backgroundColor: cssVarV2('layer/background/mobile/modal'),
    },
  },
});
export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  zIndex: cssVar('zIndexModal'),
  transition: 'padding-bottom 230ms ease-out',

  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },

  selectors: {
    '&[data-mobile]': {
      alignItems: 'flex-end',
      paddingBottom:
        'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 20px))',
    },
    '&[data-full-screen="true"]': {
      alignItems: 'flex-start',
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
    '&.anim-slideRight': {
      animation: `${contentShowSlideRight} 0.23s ease`,
      animationFillMode: 'forwards',
    },
    [`${vtScopeSelector(modalVTScope)} &.anim-slideRight.vt-active`]: {
      viewTransitionName: modalContentViewTransitionNameSlideRight,
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
globalStyle(
  `::view-transition-old(${modalContentViewTransitionNameSlideRight})`,
  {
    animation: `${contentHideSlideRight} 0.23s ease`,
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
  maxHeight: 'calc(100dvh - 32px)',
  maxWidth: 'calc(100dvw - 20px)',
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
        [widthVar]: '100dvw',
        [heightVar]: `calc(100dvh - ${keyboardInsetVar})`,
        [minHeightVar]: `calc(100dvh - ${keyboardInsetVar})`,
      },
      maxWidth: '100dvw',
      maxHeight: '100dvh',
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

globalStyle(`[data-modal="false"]${modalContentWrapper}`, {
  pointerEvents: 'none',
});

globalStyle(`[data-modal="false"] ${modalContent}`, {
  pointerEvents: 'auto',
});
