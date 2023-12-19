import { globalStyle, style } from '@vanilla-extract/css';

import { onboardingVars } from '../style.css';

export const edgelessSwitchWindow = style({
  vars: { '--bg-size': '10px' },
  borderRadius: onboardingVars.paper.r,
  backgroundColor: onboardingVars.paper.bg,
  position: 'relative',
  transition: `width ${onboardingVars.window.transition.size}, height ${onboardingVars.window.transition.size}`,
  overflow: 'hidden',
  boxShadow: 'var(--affine-shadow-2)',

  fontFamily: 'var(--affine-font-family)',
  color: onboardingVars.paper.textColor,

  selectors: {
    '&[data-mode="edgeless"]': {
      width: onboardingVars.edgeless.w,
      height: onboardingVars.edgeless.h,
    },
    '&[data-mode="page"]': {
      width: onboardingVars.article.w,
      height: onboardingVars.article.h,
    },
    // grid background
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,

      backgroundImage: onboardingVars.canvas.bgImage,
      backgroundRepeat: 'repeat',
      backgroundSize: 'calc(24px * var(--scale)) calc(24px * var(--scale))',
      backgroundPositionX: 'calc(var(--offset-x) * var(--scale))',
      backgroundPositionY: 'calc(var(--offset-y) * var(--scale))',

      opacity: 0,
      pointerEvents: 'none',
      transition: 'opacity 0.3s ease',
    },
    '&[data-mode="edgeless"]::before': {
      opacity: 1,
    },
  },
});

export const toolbar = style({
  position: 'absolute',
  bottom: '20px',
  left: '50%',
  transform: 'translateX(-50%) translateY(200px)',
  transition: 'transform 0.3s ease',

  selectors: {
    [`${edgelessSwitchWindow}[data-mode="edgeless"] &`]: {
      transform: 'translateX(-50%) translateY(0px)',
    },
  },
});

export const canvas = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  transform: 'scale(var(--scale)) translate(var(--offset-x), var(--offset-y))',
  transition: 'transform 0.36s ease',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  overflowY: 'visible',

  selectors: {
    '[data-scroll="true"] &': {
      overflowY: 'auto',
    },
    '[data-mode="edgeless"] &': {
      cursor: 'grab',
    },
    '.grabbing[data-mode="edgeless"] &': {
      cursor: 'grabbing',
      transition: 'none',
    },
    '.scaling[data-mode="edgeless"] &': {
      transition: 'none',
    },
  },
});

export const page = style({
  width: '800px',
  minHeight: onboardingVars.article.h,
  paddingTop: '150px',
  paddingBottom: '150px',
});

export const noDragWrapper = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});
globalStyle(`${noDragWrapper} > *`, {
  pointerEvents: 'auto',
});

export const header = style({
  position: 'absolute',
  top: '0',
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '24px',
  pointerEvents: 'none',
});
globalStyle(`${header} > *`, {
  pointerEvents: 'auto',
});
