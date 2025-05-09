import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 8,
  '@media': {
    'screen and (width <= 640px)': {
      flexDirection: 'row-reverse',
      width: '100%',
    },
  },
});

export const button = style({
  borderRadius: 8,
  width: 32,
  height: 32,
  background: cssVarV2('centerPeek/buttonBackground'),
  '@media': {
    'screen and (width <= 640px)': {
      selectors: {
        [`[data-action-name="close"]&`]: {
          marginLeft: 'auto',
          order: 0,
        },
      },
    },
  },
});
