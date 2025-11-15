import { style } from '@vanilla-extract/css';

export const spaceX = style({
  width: 0,
  flexGrow: 1,
});
export const spaceY = style({
  height: 0,
  flexGrow: 1,
});
export const list = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
  gap: '16px',
});
