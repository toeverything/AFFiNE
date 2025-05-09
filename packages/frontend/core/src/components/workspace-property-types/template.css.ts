import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const property = style({
  padding: '3px 4px',
  display: 'flex',
  alignItems: 'center',
});

export const checkbox = style({
  fontSize: 24,
  color: cssVarV2.icon.primary,
});
