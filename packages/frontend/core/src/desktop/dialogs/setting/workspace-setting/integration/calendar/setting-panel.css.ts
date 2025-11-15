import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});

export const newButton = style({
  color: cssVarV2.text.secondary,
});

export const newDialog = style({
  maxWidth: 480,
});

export const newDialogHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const newDialogTitle = style({
  fontSize: 15,
  lineHeight: '24px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});

export const newDialogContent = style({
  marginTop: 16,
  marginBottom: 20,
});

export const newDialogLabel = style({
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
  marginBottom: 4,
});

export const newDialogFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 20,
});
