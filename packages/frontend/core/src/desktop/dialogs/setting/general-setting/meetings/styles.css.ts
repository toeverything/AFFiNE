import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const meetingWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
});

export const permissionSetting = style({
  color: cssVarV2('text/link'),
  cursor: 'pointer',
  marginLeft: 4,
});

export const noPermissionIcon = style({
  color: cssVarV2('button/error'),
});

export const link = style({
  color: cssVarV2('text/link'),
});
