import { style } from '@vanilla-extract/css';

export const slider = style({
  overflow: 'clip',
});

export const sliderContent = style({
  display: 'flex',
  height: '100%',
  willChange: 'transform',
});

export const slideItem = style({
  width: 0,
  flex: 1,
});
