import { style } from '@vanilla-extract/css';

export const wrapper = style({
  position: 'relative',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
});

export const arts = style({
  position: 'absolute',
  top: '128px',
  pointerEvents: 'none',
});
