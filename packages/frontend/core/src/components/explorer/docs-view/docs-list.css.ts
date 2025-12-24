import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const groupHeader = style({
  background: cssVarV2.layer.background.primary,
});

export const docItem = style({
  transition: 'width 0.2s ease-in-out',
});
