import { style } from '@vanilla-extract/css';

export const floatingStyle = style({
  position: 'absolute',
  maxWidth: 'calc(10vw + 400px)',
});

export const resizingStyle = style({
  transition: '',
});
