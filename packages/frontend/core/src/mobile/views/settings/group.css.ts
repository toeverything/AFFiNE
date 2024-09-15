import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: '100%',
});

export const title = style({
  padding: '0px 8px',
  color: cssVarV2('text/tertiary'),
  fontSize: 13,
  lineHeight: '18px',
  letterSpacing: -0.08,
  fontWeight: 400,
});

export const content = style({
  background: cssVarV2('layer/background/primary'),
  borderRadius: 12,
  padding: '10px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});
