import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '1px',
  position: 'relative',
  overflow: 'hidden',
  maxWidth: 2000, // since we have at least 1000 samples, the max width is 2000
});
