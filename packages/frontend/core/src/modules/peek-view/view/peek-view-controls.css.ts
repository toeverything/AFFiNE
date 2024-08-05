import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 8,
});

export const button = style({
  borderRadius: 8,
  width: 32,
  height: 32,
});
