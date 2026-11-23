import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const host = style({});

export const notePreviewSettingMenuContainer = style({
  padding: '8px',
  width: '220px',
  display: 'flex',
  flexDirection: 'column',
});

export const notePreviewSettingMenuItem = style({
  display: 'flex',
  boxSizing: 'border-box',
  width: '100%',
  height: '28px',
  padding: '4px 12px',
  alignItems: 'center',
});

export const settingLabel = style({
  fontFamily: 'sans-serif',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
  padding: '0 4px',
});

export const action = style({
  gap: '4px',
});

export const actionLabel = style({
  width: '138px',
  height: '20px',
  padding: '0 4px',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2('text/primary'),
});

export const toggleButton = style({
  display: 'flex',
});
