import { style } from '@vanilla-extract/css';

export const workbenchRootContainer = style({
  display: 'flex',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
});

export const workbenchViewContainer = style({
  flex: 1,
  overflow: 'hidden',
  height: '100%',
});
