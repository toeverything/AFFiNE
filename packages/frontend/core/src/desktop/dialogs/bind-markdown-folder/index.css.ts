import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: 360,
});

export const path = style({
  overflow: 'hidden',
  color: cssVarV2.text.secondary,
  fontSize: 13,
  lineHeight: '20px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  overflowY: 'auto',
});

export const workspace = style({
  border: `1px solid ${cssVarV2.layer.insideBorder.blackBorder}`,
  borderRadius: 6,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: cssVarV2.layer.background.hoverOverlay,
    },
  },
});

export const empty = style({
  color: cssVarV2.text.secondary,
  fontSize: 14,
  lineHeight: '22px',
  padding: '12px 0',
});
