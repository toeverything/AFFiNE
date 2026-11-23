import { cssVarV2 } from '@toeverything/theme/v2';
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
  selectors: {
    '&[data-is-windows]': {
      backgroundColor: cssVarV2('layer/background/primary'),
    },
  },
});
