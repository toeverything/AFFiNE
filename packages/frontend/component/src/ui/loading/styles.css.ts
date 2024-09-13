import { createVar, keyframes, style } from '@vanilla-extract/css';
export const speedVar = createVar('speedVar');
const rotate = keyframes({
  '0%': {
    transform: 'rotate(0deg)',
  },
  '50%': {
    transform: 'rotate(180deg)',
  },
  '100%': {
    transform: 'rotate(360deg)',
  },
});
export const loading = style({
  transform: 'rotate(-90deg)',
});

export const rotateAnimation = style({
  vars: {
    [speedVar]: '1.5s',
  },
  animation: `${rotate} ${speedVar} infinite linear`,
});
