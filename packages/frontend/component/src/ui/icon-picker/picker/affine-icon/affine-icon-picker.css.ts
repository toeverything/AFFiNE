import { style } from '@vanilla-extract/css';

export const colorList = style({
  display: 'flex',
  gap: 4,
});

export const colorItem = style({
  padding: 2,
});

export const colorDot = style({
  width: '1em',
  height: '1em',
  borderRadius: '50%',
  background: 'currentColor',
});
