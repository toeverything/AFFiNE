import { style } from '@vanilla-extract/css';

export const invisibleWrapper = style({
  position: 'absolute',
  padding: 'inherit',
  width: '100%',
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  pointerEvents: 'none',
});
export const invisibleList = style({
  width: `calc(50% - 17px / 2)`,
});
export const stacks = style({
  position: 'relative',
  width: '100%',
  display: 'flex',
  gap: 17,
  padding: 16,
});
export const stack = style({
  width: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});
