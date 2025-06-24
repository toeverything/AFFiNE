import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const properties = style({
  padding: '4px 0px 8px 0px',
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
});

export const sectionLabel = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
  padding: 4,
});

export const property = style({
  selectors: {
    '&[data-show="false"]': {
      backgroundColor: cssVarV2.button.emptyIconBackground,
      color: cssVarV2.icon.disable,
    },
  },
});
