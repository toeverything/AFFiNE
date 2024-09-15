import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const list = style({});
export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 16,

  color: 'unset',
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
export const icon = style({
  width: 24,
  height: 24,
  color: cssVarV2('icon/primary'),
  flexShrink: 0,
});
export const prefixIcon = style([icon]);
export const name = style({
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

export const suffixIcon = style([icon]);
