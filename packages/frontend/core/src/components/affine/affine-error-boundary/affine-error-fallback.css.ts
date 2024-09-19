import { style } from '@vanilla-extract/css';
export const viewport = style({
  height: '100%',
  width: '100%',
  position: 'relative',
});

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
});
