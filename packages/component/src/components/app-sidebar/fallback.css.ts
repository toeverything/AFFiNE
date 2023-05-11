import { style } from '@vanilla-extract/css';

export const fallbackStyle = style({
  margin: '0 2px',
  height: '100%',
});

export const fallbackHeaderStyle = style({
  padding: '0 6px',
  height: '58px',
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
});
