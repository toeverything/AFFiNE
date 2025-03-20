import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 20,
});
export const connectDialog = style({
  width: 480,
  maxWidth: `calc(100vw - 32px)`,
  display: 'flex',
  flexDirection: 'column',
});
export const connectDialogTitle = style({
  fontSize: 18,
  fontWeight: 600,
  lineHeight: '26px',
  letterSpacing: '0.24px',
  color: cssVarV2.text.primary,
  marginBottom: 12,
});
export const connectDialogDesc = style({
  fontSize: 15,
  fontWeight: 400,
  lineHeight: '24px',
  color: cssVarV2.text.primary,
  height: 0,
  flexGrow: 1,
  marginBottom: 20,
});
