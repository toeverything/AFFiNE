import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'auto',
  width: '100%',
  minWidth: '300px',
});
