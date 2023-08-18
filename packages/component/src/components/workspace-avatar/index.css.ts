import { keyframes, style } from '@vanilla-extract/css';
export const avatarStyle = style({
  width: '100%',
  height: '100%',
  color: '#fff',
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'inline-block',
  verticalAlign: 'middle',
});

export const avatarImageStyle = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  display: 'block',
});

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
  borderRadius: '50%',
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
  filter: 'blur(12px)',
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
  filter: 'blur(12px)',
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
  filter: 'blur(12px)',
  transform: 'matrix(-0.28, -0.96, 0.93, -0.37, 0, 0)',
  transformOrigin: 'center center',
});
