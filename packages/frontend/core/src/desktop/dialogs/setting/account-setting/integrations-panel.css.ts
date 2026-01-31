import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '12px 0 4px',
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
});

export const panelTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  lineHeight: '22px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});

export const loading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px 0',
});

export const accountList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});

export const accountRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '12px 16px',
  borderRadius: 8,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  background: cssVarV2.layer.background.primary,
});

export const accountInfo = style({
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
});

export const accountIcon = style({
  width: 32,
  height: 32,
  borderRadius: 8,
  background: cssVarV2.layer.background.secondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2.text.secondary,
});

export const accountDetails = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const accountName = style({
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
  color: cssVarV2.text.primary,
});

export const accountMeta = style({
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  fontSize: 12,
  lineHeight: '18px',
  color: cssVarV2.text.secondary,
});

export const accountStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  lineHeight: '18px',
  color: cssVarV2.status.error,
});

export const statusDot = style({
  width: 6,
  height: 6,
  borderRadius: 999,
  background: cssVarV2.status.error,
});

export const accountActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
});

export const interval = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-end',
});

export const intervalLabel = style({
  fontSize: 11,
  lineHeight: '16px',
  color: cssVarV2.text.secondary,
});

export const empty = style({
  fontSize: 12,
  lineHeight: '20px',
  color: cssVarV2.text.secondary,
  padding: '12px 0',
});
