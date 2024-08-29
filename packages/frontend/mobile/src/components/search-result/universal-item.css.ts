import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,

  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  height: 44,

  color: 'unset',
  ':visited': { color: 'unset' },
  ':hover': { color: 'unset' },
  ':active': { color: 'unset' },
  ':focus': { color: 'unset' },
});
export const iconWrapper = style({
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: 24,
  color: cssVarV2('icon/primary'),
});
export const content = style({
  width: 0,
  flex: 1,
  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 400,
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),

  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});
export const suffixIcon = style({
  color: cssVarV2('icon/secondary'),
});
