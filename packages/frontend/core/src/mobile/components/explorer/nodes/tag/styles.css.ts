import { style } from '@vanilla-extract/css';

export const tagIcon = style({
  borderRadius: '50%',
  height: '8px',
  width: '8px',
});

export const tagIconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1em',
  height: '1em',
});
