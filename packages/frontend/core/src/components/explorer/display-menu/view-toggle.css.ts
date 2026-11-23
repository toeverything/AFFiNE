import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const viewToggle = style({
  backgroundColor: 'transparent',
});
export const viewToggleItem = style({
  padding: 0,
  fontSize: 16,
  width: 24,
  color: cssVarV2.icon.primary,
  selectors: {
    '&[data-state=checked]': {
      color: cssVarV2.icon.primary,
    },
  },
});
export const viewToggleIndicator = style({
  backgroundColor: cssVarV2.layer.background.hoverOverlay,
  boxShadow: 'none',
});
