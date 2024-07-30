import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  width: '100vw',
  height: '100vh',
  opacity: 1,
  transition: 'opacity 0.1s',
  background: cssVar('backgroundPrimaryColor'),
  selectors: {
    '&[data-active="false"]': {
      opacity: 0,
    },
    '&[data-translucent="true"]': {
      background: 'transparent',
    },
  },
});

globalStyle(`${root}[data-active="false"] *`, {
  ['WebkitAppRegion' as string]: 'no-drag !important',
});
