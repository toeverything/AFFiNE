import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const profile = style({
  display: 'flex',
  alignItems: 'center',
  gap: 13,
});

export const avatarWrapper = style({
  width: 48,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const content = style({
  width: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

const ellipsis = style({
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});

export const title = style({
  fontSize: 17,
  lineHeight: '22px',
  fontWeight: 400,
  letterSpacing: -0.43,
  color: cssVarV2('text/primary'),
});

export const caption = style({
  fontSize: 15,
  lineHeight: '20px',
  fontWeight: 400,
  letterSpacing: -0.23,
  color: cssVarV2('text/secondary'),
});

export const suffixIcon = style({
  fontSize: 30,
  color: cssVarV2('icon/primary'),
});

export const emailInfo = style([ellipsis, { width: '100%' }]);
export const nameWithTag = style({
  display: 'flex',
  gap: 8,
});
export const name = style([ellipsis]);
