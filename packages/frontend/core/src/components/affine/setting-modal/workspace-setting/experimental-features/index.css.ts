import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const promptRoot = style({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});
export const promptTitle = style({
  fontSize: cssVar('fontH4'),
  fontWeight: '600',
  marginBottom: 48,
});
export const promptArt = style({
  marginBottom: 68,
});
export const promptWarning = style({
  backgroundColor: cssVar('backgroundTertiaryColor'),
  fontSize: cssVar('fontXs'),
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 14,
  padding: 10,
  borderRadius: 8,
});
export const promptWarningTitle = style({
  color: cssVar('errorColor'),
  fontWeight: 600,
});
export const spacer = style({
  flexGrow: 1,
  minHeight: 12,
});
export const promptDisclaimer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 32,
  gap: 4,
});

export const settingsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});

export const promptDisclaimerConfirm = style({
  display: 'flex',
  justifyContent: 'center',
});
export const switchRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const switchDisabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
});
export const subHeader = style({
  fontWeight: '600',
  color: cssVar('textSecondaryColor'),
  marginBottom: 8,
});
