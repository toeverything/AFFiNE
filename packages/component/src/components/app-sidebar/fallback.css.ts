import { style } from '@vanilla-extract/css';

export const fallbackStyle = style({
  margin: '12px 16px',
  height: '100%',
});

export const fallbackHeaderStyle = style({
  height: '56px',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  gap: '8px',
});
