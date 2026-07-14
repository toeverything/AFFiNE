import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  borderRadius: 14,
  padding: '14px',
  backgroundColor: cssVarV2('layer/background/primary'),
  boxSizing: 'border-box',
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'center',
});

export const title = style({
  fontSize: '18px',
  lineHeight: '24px',
  fontWeight: 600,
  color: cssVarV2('text/primary'),
  textAlign: 'center',
});

export const perkRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  width: '100%',
});

export const perkIcon = style({
  width: 12,
  height: 12,
  marginTop: 3,
  flexShrink: 0,
  borderRadius: 3,
  transform: 'rotate(45deg)',
  background: 'linear-gradient(135deg, #F8D12F 0%, #F5A524 100%)',
});

export const description = style({
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
});

export const button = style({
  width: '100%',
  minHeight: 36,
  fontSize: '14px',
  borderRadius: 999,
});
