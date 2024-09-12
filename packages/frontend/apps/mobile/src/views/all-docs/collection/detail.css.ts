import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const headerContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,

  fontSize: 17,
  fontWeight: 600,
  lineHeight: '22px',
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),
});

export const headerIcon = style({
  fontSize: 24,
  color: cssVarV2('icon/primary'),
});
