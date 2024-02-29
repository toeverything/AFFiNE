import { style } from '@vanilla-extract/css';

export const workbenchRootContainer = style({
  display: 'flex',
  height: '100%',
});

export const workbenchViewContainer = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});
