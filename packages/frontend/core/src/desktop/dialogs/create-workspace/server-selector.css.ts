import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const trigger = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const arrow = style({
  transition: 'transform 0.2s ease',
  transform: 'rotate(0deg)',
  fontSize: 16,
  color: cssVarV2.icon.primary,
  selectors: {
    '&.open': {
      transform: 'rotate(180deg)',
    },
  },
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const item = style({
  padding: 4,
  gap: 8,
});

export const done = style({
  color: cssVarV2.icon.primary,
  fontSize: 20,
});
