import { style } from '@vanilla-extract/css';

export const chatRoot = style({
  width: '100%',
  height: '100%',
  maxWidth: 800,
  padding: '0px 16px',
  margin: '0 auto',
});

export const chatHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});
