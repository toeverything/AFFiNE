import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({});
export const content = style({
  paddingTop: 6,
});

export const header = style({
  selectors: {
    '&[data-dragged-over="true"]': {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
  },
});
