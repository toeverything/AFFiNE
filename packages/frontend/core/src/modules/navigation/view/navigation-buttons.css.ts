import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  alignItems: 'center',
  columnGap: '8px',
});

export const button = style({
  width: '32px',
  height: '32px',
  flexShrink: 0,
});
