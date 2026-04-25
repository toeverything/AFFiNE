import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  flexDirection: 'column',
  background: cssVar('backgroundPrimaryColor'),
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  zIndex: 0,
});
