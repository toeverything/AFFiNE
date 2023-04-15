import { style } from '@vanilla-extract/css';

export const floatingStyle = style({
  maxWidth: 'calc(10vw + 400px)',
});

export const macOSStyle = style({
  background: 'transparent',
  borderRight: '1px solid',
});

export const nonFloatingStyle = style({
  maxWidth: 'calc(100vw - 698px)',
});

export const resizingStyle = style({
  transition: 'transform .3s, width .3s, max-width .3s',
});

export const showStyle = style({
  transform: 'translateX(0)',
});

export const hideStyle = style({
  transform: 'translateX(-100%)',
});
