import { globalStyle, style } from '@vanilla-extract/css';
export const root = style({
  width: '1em',
  height: '1em',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
const magicColor = `rgb(119,117,125)`;
globalStyle(`${root} path[stroke="${magicColor}"]`, {
  stroke: 'currentColor',
});
globalStyle(`${root} path[fill="${magicColor}"]`, {
  fill: 'currentColor',
});
