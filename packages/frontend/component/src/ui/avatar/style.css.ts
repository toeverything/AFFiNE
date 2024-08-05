import { cssVar } from '@toeverything/theme';
import { createVar, keyframes, style } from '@vanilla-extract/css';
export const sizeVar = createVar('sizeVar');
export const blurVar = createVar('blurVar');
const bottomAnimation = keyframes({
  '0%': {
    top: '-44%',
    left: '-11%',
    transform: 'matrix(-0.29, -0.96, 0.94, -0.35, 0, 0)',
  },
  '16%': {
    left: '-18%',
    top: '-51%',
    transform: 'matrix(-0.73, -0.69, 0.64, -0.77, 0, 0)',
  },
  '32%': {
    left: '-7%',
    top: '-40%',
    transform: 'matrix(-0.97, -0.23, 0.16, -0.99, 0, 0)',
  },
  '48%': {
    left: '-15%',
    top: '-39%',
    transform: 'matrix(-0.88, 0.48, -0.6, -0.8, 0, 0)',
  },
  '64%': {
    left: '-7%',
    top: '-40%',
    transform: 'matrix(-0.97, -0.23, 0.16, -0.99, 0, 0)',
  },
  '80%': {
    left: '-18%',
    top: '-51%',
    transform: 'matrix(-0.73, -0.69, 0.64, -0.77, 0, 0)',
  },
  '100%': {
    top: '-44%',
    left: '-11%',
    transform: 'matrix(-0.29, -0.96, 0.94, -0.35, 0, 0)',
  },
});
const middleAnimation = keyframes({
  '0%': {
    left: '-30px',
    top: '-30px',
    transform: 'matrix(-0.48, -0.88, 0.8, -0.6, 0, 0)',
  },
  '16%': {
    left: '-37px',
    top: '-37px',
    transform: 'matrix(-0.86, -0.52, 0.39, -0.92, 0, 0)',
  },
  '32%': {
    left: '-20px',
    top: '-10px',
    transform: 'matrix(-1, -0.02, -0.12, -0.99, 0, 0)',
  },
  '48%': {
    left: '-27px',
    top: '-2px',
    transform: 'matrix(-0.88, 0.48, -0.6, -0.8, 0, 0)',
  },
  '64%': {
    left: '-20px',
    top: '-10px',
    transform: 'matrix(-1, -0.02, -0.12, -0.99, 0, 0)',
  },
  '80%': {
    left: '-37px',
    top: '-37px',
    transform: 'matrix(-0.86, -0.52, 0.39, -0.92, 0, 0)',
  },
  '100%': {
    left: '-30px',
    top: '-30px',
    transform: 'matrix(-0.48, -0.88, 0.8, -0.6, 0, 0)',
  },
});
export const DefaultAvatarContainerStyle = style({
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
});
export const DefaultAvatarMiddleItemStyle = style({
  width: '83%',
  height: '81%',
  position: 'absolute',
  left: '-30%',
  top: '-30%',
  transform: 'matrix(-0.48, -0.88, 0.8, -0.6, 0, 0)',
  opacity: '0.8',
  filter: `blur(${blurVar})`,
  transformOrigin: 'center center',
  animation: `${middleAnimation} 3s ease-in-out forwards infinite`,
  animationPlayState: 'paused',
});
export const DefaultAvatarMiddleItemWithAnimationStyle = style({
  animationPlayState: 'running',
});
export const DefaultAvatarBottomItemStyle = style({
  width: '98%',
  height: '97%',
  position: 'absolute',
  top: '-44%',
  left: '-11%',
  transform: 'matrix(-0.29, -0.96, 0.94, -0.35, 0, 0)',
  opacity: '0.8',
  filter: `blur(${blurVar})`,
  transformOrigin: 'center center',
  willChange: 'left, top, transform',
  animation: `${bottomAnimation} 3s ease-in-out forwards infinite`,
  animationPlayState: 'paused',
});
export const DefaultAvatarBottomItemWithAnimationStyle = style({
  animationPlayState: 'running',
});
export const DefaultAvatarTopItemStyle = style({
  width: '104%',
  height: '94%',
  position: 'absolute',
  right: '-30%',
  top: '-30%',
  opacity: '0.8',
  filter: `blur(${blurVar})`,
  transform: 'matrix(-0.28, -0.96, 0.93, -0.37, 0, 0)',
  transformOrigin: 'center center',
});
export const avatarRoot = style({
  position: 'relative',
  display: 'inline-flex',
  flexShrink: 0,
});
export const avatarWrapper = style({
  vars: {
    [sizeVar]: 'unset',
  },
  width: sizeVar,
  height: sizeVar,
  fontSize: `calc(${sizeVar} / 2)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  verticalAlign: 'middle',
  userSelect: 'none',
  position: 'relative',
  overflow: 'hidden',
});
export const avatarImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});
export const avatarFallback = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: cssVar('primaryColor'),
  color: cssVar('white'),
  lineHeight: '1',
  fontWeight: '500',
});
export const hoverWrapper = style({
  width: '100%',
  height: '100%',
  position: 'absolute',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  zIndex: '1',
  color: cssVar('pureWhite'),
  opacity: 0,
  transition: 'opacity .15s',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      opacity: 1,
    },
  },
});
export const removeButton = style({
  position: 'absolute',
  right: '-8px',
  top: '-2px',
  visibility: 'hidden',
  zIndex: '1',
  selectors: {
    [`${avatarRoot}:hover &`]: {
      visibility: 'visible',
    },
  },
});
