import { keyframes, style } from '@vanilla-extract/css';

import { paperLocation } from '../style.css';
const moveInAnim = keyframes({
  '0%': {
    transform: `translateZ(var(--fromZ)) translateX(var(--fromX)) translateY(var(--fromY)) rotateX(var(--fromRotateX)) rotateY(var(--fromRotateY)) rotateZ(var(--fromRotateZ))`,
  },
  '100%': {
    transform: `translateZ(var(--toZ)) translateX(0) translateY(0) rotateX(0deg) rotateY(0deg) rotateZ(var(--toRotateZ))`,
  },
});
export const moveIn = style([
  paperLocation,
  {
    animation: `${moveInAnim} var(--duration) ease forwards`,
    animationDelay: 'var(--delay)',
    transform: 'translateY(100vh)', // hide on init
  },
]);
