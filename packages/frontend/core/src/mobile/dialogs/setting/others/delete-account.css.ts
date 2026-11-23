import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const description = style({
  fontSize: cssVar('fontBase'),
  lineHeight: 1.6,
});

export const deleteAccountLabel = style({
  color: cssVarV2('status/error'),
});

export const inputWrapper = style({
  marginTop: '12px',
});
