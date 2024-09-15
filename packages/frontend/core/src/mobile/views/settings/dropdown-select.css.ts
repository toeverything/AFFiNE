import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
export const label = style({
  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 400,
  letterSpacing: -0.43,
  color: cssVarV2('text/placeholder'),
});
export const icon = style({
  fontSize: 24,
  color: cssVarV2('icon/primary'),
});
