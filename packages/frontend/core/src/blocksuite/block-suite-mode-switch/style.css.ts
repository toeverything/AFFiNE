import { globalStyle, style } from '@vanilla-extract/css';

export const switchItem = style({
  width: 24,
  height: 24,
});
// a workaround to override lottie svg stroke with default radio button color schemes
globalStyle(`${switchItem} svg path`, {
  stroke: 'currentColor',
});
