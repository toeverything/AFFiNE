import { style } from '@vanilla-extract/css';

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: '100%',
});

export const groupContent = style({
  gap: 0,
  padding: 0,
  overflow: 'hidden',
});
