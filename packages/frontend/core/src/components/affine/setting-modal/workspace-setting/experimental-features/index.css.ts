import { style } from '@vanilla-extract/css';

export const promptRoot = style({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});

export const promptTitle = style({
  fontSize: 'var(--affine-font-h-4)',
  fontWeight: '600',
  marginBottom: 48,
});

export const promptArt = style({
  marginBottom: 68,
});

export const promptWarning = style({
  backgroundColor: 'var(--affine-background-tertiary-color)',
  fontSize: 'var(--affine-font-xs)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 14,
  padding: 10,
  borderRadius: 8,
});

export const promptWarningTitle = style({
  color: 'var(--affine-error-color)',
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

export const promptDisclaimerConfirm = style({
  display: 'flex',
  justifyContent: 'center',
});

export const switchRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 32,
});

export const switchDisabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
});
