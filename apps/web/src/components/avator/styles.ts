import { keyframes, styled } from '@affine/component';
import type { CSSProperties } from 'react';

export const StyledContainer = styled('div')(() => {
  return {
    width: '100px',
    height: '100px',
    position: 'relative',
    borderRadius: '50%',
    overflow: 'hidden',
  };
});
export const StyledBottomItem = styled('div')<{
  color: CSSProperties['color'];
  startAnimate: boolean;
}>(({ color, startAnimate }) => {
  return {
    width: '98.83px',
    height: '97.6px',
    position: 'absolute',
    top: '-44px',
    left: '-11px',
    transform: 'matrix(-0.29, -0.96, 0.94, -0.35, 0, 0)',
    background: color,
    opacity: '0.8',
    filter: 'blur(12px)',
    transformOrigin: 'center center',
    animation: startAnimate
      ? `${bottomAnimation} 3s ease-in-out forwards infinite`
      : 'unset',
  };
});
export const StyledMiddleItem = styled('div')<{
  color: CSSProperties['color'];
  startAnimate: boolean;
}>(({ color, startAnimate }) => {
  return {
    width: '83.86px',
    height: '81.23px',
    position: 'absolute',
    left: '-30px',
    top: '-30px',
    transform: 'matrix(-0.48, -0.88, 0.8, -0.6, 0, 0)',
    background: color,
    opacity: '0.8',
    filter: 'blur(12px)',
    transformOrigin: 'center center',
    animation: startAnimate
      ? `${middleAnimation} 6s ease-in-out infinite`
      : 'unset',
  };
});
export const StyledTopItem = styled('div')<{
  color: CSSProperties['color'];
  startAnimate: boolean;
}>(({ color, startAnimate }) => {
  return {
    width: '104.68px',
    height: '94.63px',
    position: 'absolute',
    right: '-30px',
    top: '-30px',
    background: color,
    opacity: '0.8',
    filter: 'blur(12px)',
    transform: 'matrix(-0.28, -0.96, 0.93, -0.37, 0, 0)',
    transformOrigin: 'center center',
  };
});
const bottomAnimation = keyframes({
  '0%': {
    top: '-44px',
    left: '-11px',
    transform: 'matrix(-0.29, -0.96, 0.94, -0.35, 0, 0)',
  },
  '16%': {
    left: '-18px',
    top: '-51px',
    transform: 'matrix(-0.73, -0.69, 0.64, -0.77, 0, 0)',
  },
  '32%': {
    left: '-7px',
    top: '-40px',
    transform: 'matrix(-0.97, -0.23, 0.16, -0.99, 0, 0)',
  },
  '48%': {
    left: '-15px',
    top: '-39px',
    transform: 'matrix(-0.88, 0.48, -0.6, -0.8, 0, 0)',
  },
  '64%': {
    left: '-7px',
    top: '-40px',
    transform: 'matrix(-0.97, -0.23, 0.16, -0.99, 0, 0)',
  },
  '80%': {
    left: '-18px',
    top: '-51px',
    transform: 'matrix(-0.73, -0.69, 0.64, -0.77, 0, 0)',
  },
  '100%': {
    top: '-44px',
    left: '-11px',
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
