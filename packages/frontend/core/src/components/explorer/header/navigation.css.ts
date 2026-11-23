import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  fontSize: 18,
  lineHeight: '26px',
  fontWeight: 600,
  paddingLeft: 8,
});

export const item = style({
  color: cssVarV2.text.secondary,
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2.text.primary,
    },
  },
});
