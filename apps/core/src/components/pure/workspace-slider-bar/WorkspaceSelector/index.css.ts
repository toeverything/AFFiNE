import { createVar, keyframes, style } from '@vanilla-extract/css';
export const workspaceAvatarStyle = style({
  flexShrink: 0,
});

export const speedVar = createVar('speedVar');

const rotate = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '50%': { transform: 'rotate(180deg)' },
  '100%': { transform: 'rotate(360deg)' },
});
export const loading = style({
  vars: {
    [speedVar]: '1.5s',
  },
  textRendering: 'optimizeLegibility',
  WebkitFontSmoothing: 'antialiased',
  animation: `${rotate} ${speedVar} infinite linear`,
});
