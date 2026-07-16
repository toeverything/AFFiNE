import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  borderRadius: 24,
  padding: '24px',
  backgroundColor: cssVarV2('layer/background/primary'),
  boxSizing: 'border-box',
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
});

export const headerRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  width: '100%',
});

export const perkIconWrapper = style({
  width: 42,
  height: 42,
  borderRadius: '50%',
  backgroundColor: cssVarV2('layer/background/secondary'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const textBlock = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 8,
  minWidth: 0,
  flex: 1,
});

export const title = style({
  fontSize: '18px',
  lineHeight: '22px',
  fontWeight: 600,
  color: cssVarV2('text/primary'),
  textAlign: 'left',
});

export const perkIcon = style({
  width: 18,
  height: 18,
  flexShrink: 0,
  objectFit: 'contain',
});

export const description = style({
  fontSize: '14px',
  lineHeight: '19px',
  fontWeight: 400,
  color: cssVarV2('text/secondary'),
  maxWidth: 250,
});

export const button = style({
  width: '100%',
  minHeight: 56,
  fontSize: '17px',
  fontWeight: 600,
  borderRadius: 999,
});
