import { cssVar } from '@toeverything/theme';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';

import { onboardingVars } from '../style.css';
export const edgelessSwitchWindow = style({
  vars: {
    '--bg-size': '10px',
  },
  borderRadius: onboardingVars.paper.r,
  backgroundColor: onboardingVars.paper.bg,
  position: 'relative',
  transition: `width ${onboardingVars.window.transition.size}, height ${onboardingVars.window.transition.size}, border-radius ${onboardingVars.window.transition.size}`,
  overflow: 'hidden',
  boxShadow: onboardingVars.web.windowShadow,
  fontFamily: cssVar('fontFamily'),
  color: onboardingVars.paper.textColor,
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: 'calc(100vh - 48px)',
  selectors: {
    '&[data-mode="edgeless"]': {
      width: onboardingVars.edgeless.w,
      height: onboardingVars.edgeless.h,
      borderRadius: onboardingVars.edgeless.r,
    },
    '&[data-mode="page"]': {
      width: onboardingVars.article.w,
      height: onboardingVars.article.h,
      borderRadius: onboardingVars.article.r,
    },
    '&[data-mode="well-done"]': {
      width: onboardingVars.wellDone.w,
      height: onboardingVars.wellDone.h,
      borderRadius: onboardingVars.wellDone.r,
    },
  },
});
export const orbit = style({
  width: '200%',
  height: '100%',
  display: 'flex',
  transition: 'transform 0.4s ease',
  willChange: 'transform',
  selectors: {
    '[data-mode="well-done"] &': {
      transform: 'translateX(-50%)',
    },
  },
});
export const orbitItem = style({
  width: '50%',
  height: '100%',
  flexShrink: 0,
  flexGrow: 0,
  overflow: 'hidden',
});
export const doc = style({
  selectors: {
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
    '[data-mode="edgeless"] &::before': {
      opacity: 1,
    },
  },
});
export const wellDone = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  textAlign: 'center',
  userSelect: 'none',
});
const wellDoneSlideIn = keyframes({
  from: {
    transform: 'translateX(100px)',
    opacity: 0,
  },
  to: {
    transform: 'translateX(0)',
    opacity: 1,
  },
});
export const wellDoneEnterAnim = style({
  opacity: 0,
  selectors: {
    '[data-mode="well-done"] &': {
      animation: `${wellDoneSlideIn} 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) forwards`,
    },
    '&:nth-child(1)': {
      animationDelay: '0.1s',
    },
    '&:nth-child(2)': {
      animationDelay: '0.15s',
    },
    '&:nth-child(3)': {
      animationDelay: '0.2s',
    },
    '&:nth-child(4)': {
      animationDelay: '0.25s',
    },
  },
});
export const wellDoneTitle = style({
  fontSize: 28,
  lineHeight: '36px',
  fontWeight: '600',
});
export const wellDoneContent = style({
  fontSize: 15,
  lineHeight: '24px',
  fontWeight: '400',
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
    '[data-mode="edgeless"] .grabbing &': {
      cursor: 'grabbing',
      transition: 'none',
    },
    '[data-mode="edgeless"] .scaling &': {
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
