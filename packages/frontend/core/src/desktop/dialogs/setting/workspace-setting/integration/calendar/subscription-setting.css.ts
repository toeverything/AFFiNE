import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVarV2.layer.background.secondary,
    },
  },
});

export const color = style({
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
});

export const info = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

export const name = style({
  fontSize: 14,
  lineHeight: '20px',
  color: cssVarV2.text.primary,
});

export const meta = style({
  fontSize: 12,
  lineHeight: '18px',
  color: cssVarV2.text.secondary,
});
