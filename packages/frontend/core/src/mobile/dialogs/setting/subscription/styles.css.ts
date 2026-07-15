import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  borderRadius: 12,
  padding: '12px 14px',
  backgroundColor: cssVarV2('layer/background/primary'),
  boxSizing: 'border-box',
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'stretch',
});

export const title = style({
  fontSize: '17px',
  lineHeight: '22px',
  fontWeight: 600,
  color: cssVarV2('text/primary'),
  textAlign: 'left',
});

export const perkRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
});

export const perkIcon = style({
  width: 16,
  height: 16,
  marginTop: 1,
  flexShrink: 0,
  objectFit: 'contain',
});

export const description = style({
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
});

export const button = style({
  width: '100%',
  minHeight: 36,
  fontSize: '13px',
  borderRadius: 999,
});
