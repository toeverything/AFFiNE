import { createVar, style } from '@vanilla-extract/css';

export const topOffsetVar = createVar();
export const bottomOffsetVar = createVar();

export const safeArea = style({
  selectors: {
    '&[data-top]': {
      paddingTop: `calc(${topOffsetVar} + 12px)`,
    },
    '&[data-bottom]': {
      paddingBottom: `calc(${bottomOffsetVar} + 0px)`,
    },
    '&[data-standalone][data-top]': {
      paddingTop: `calc(env(safe-area-inset-top, 12px) + ${topOffsetVar})`,
    },
    '&[data-standalone][data-bottom]': {
      // paddingBottom: 'env(safe-area-inset-bottom, 12px)',
      paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffsetVar})`,
    },
  },
});
