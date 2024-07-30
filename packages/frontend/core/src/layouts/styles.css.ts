import { style } from '@vanilla-extract/css';

export const browserAppViewContainer = style({
  display: 'flex',
  flexFlow: 'row',
  height: '100%',
  width: '100%',
  position: 'relative',
});

export const desktopAppViewContainer = style({
  display: 'flex',
  flexFlow: 'column',
  height: '100%',
  width: '100%',
});

export const desktopAppViewMain = style({
  display: 'flex',
  flexFlow: 'row',
  width: '100%',
  height: 'calc(100% - 52px)',
  position: 'relative',
});

export const desktopTabsHeader = style({
  display: 'flex',
  flexFlow: 'row',
  height: '52px',
  zIndex: 1,
  width: '100%',
  overflow: 'hidden',
});
