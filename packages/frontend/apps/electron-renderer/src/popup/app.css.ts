import { globalStyle, style } from '@vanilla-extract/css';

globalStyle('html', {
  backgroundColor: 'transparent',
});

globalStyle('body', {
  backgroundColor: 'transparent',
});

export const root = style({
  backgroundColor: 'transparent',
  width: '100%',
  height: '100%',
  userSelect: 'none',
});
