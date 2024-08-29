import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const search = style({
  width: '100%',
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 8px',
  background: cssVarV2('layer/background/primary'),
  borderRadius: 10,

  color: cssVarV2('text/secondary'),
  fontSize: 17,
  fontWeight: 400,
  lineHeight: '22px',
  letterSpacing: -0.43,
});

export const icon = style({
  width: 20,
  height: 20,
  color: cssVarV2('icon/primary'),
});
