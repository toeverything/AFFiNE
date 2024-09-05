import { style } from '@vanilla-extract/css';

export const root = style({
  padding: '40px',
  justifyContent: 'flex-end',
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  zIndex: 0,
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 24,
});
