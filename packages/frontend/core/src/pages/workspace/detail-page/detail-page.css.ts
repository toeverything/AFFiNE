import { style } from '@vanilla-extract/css';

export const mainContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  zIndex: 0,
});
