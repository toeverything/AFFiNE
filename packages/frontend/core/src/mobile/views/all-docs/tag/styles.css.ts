import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const list = style({});
export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 16,

  ':visited': { color: 'unset' },
  ':hover': { color: 'unset' },
  ':active': { color: 'unset' },
  ':focus': { color: 'unset' },

  selectors: {
    '&:not(:last-child)': {
      borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
    },
  },
});
export const content = style({
  width: 0,
  flex: 1,

  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',

  color: cssVarV2('text/primary'),
  fontSize: 17,
  fontWeight: 600,
  lineHeight: '24px',
  letterSpacing: -0.43,
});

export const prefixIcon = style({
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ':before': {
    content: '""',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'currentColor',
  },
});
export const suffixIcon = style({
  padding: 0,
  fontSize: 24,
});
