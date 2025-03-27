import { globalStyle, style } from '@vanilla-extract/css';

globalStyle('html', {
  backgroundColor: 'transparent',
  userSelect: 'none',
});

globalStyle('body', {
  backgroundColor: 'transparent',
});

export const root = style({
  backgroundColor: 'transparent',
  width: '100%',
  height: '100%',
});
