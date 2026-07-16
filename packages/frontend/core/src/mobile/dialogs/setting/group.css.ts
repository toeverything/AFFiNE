import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const group = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: '100%',
});

export const groupTitle = style({
  color: cssVarV2('text/tertiary'),
  fontSize: 14,
  lineHeight: '18px',
  padding: 4,
});

export const groupContent = style({
  gap: 0,
  padding: 0,
  overflow: 'hidden',
});
