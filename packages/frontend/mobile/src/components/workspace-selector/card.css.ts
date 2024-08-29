import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const card = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

export const label = style({
  display: 'flex',
  gap: 4,

  fontSize: 17,
  fontWeight: 600,
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  letterSpacing: -0.43,
});

export const dropdownIcon = style({
  fontSize: 24,
  color: cssVarV2('icon/primary'),
});
