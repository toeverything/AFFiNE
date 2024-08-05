import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const headerMenuTrigger = style({
  selectors: {
    '&[data-state=open]': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
});
