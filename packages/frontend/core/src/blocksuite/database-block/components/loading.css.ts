import { keyframes, style } from '@vanilla-extract/css';

export const progressSvg = style({
  transform: 'rotate(-90deg)',
});
export const progressIconContainer = style({
  position: 'relative',
  width: '24px',
  height: '24px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const progressCircle = style({
  transition: 'stroke-dasharray 0.3s ease-in-out',
});
const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});
export const spinnerAnimation = style({
  animation: `${spin} 1s linear infinite`,
});
