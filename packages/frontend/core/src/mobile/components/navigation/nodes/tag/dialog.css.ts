import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const colorDot = style({
  width: 42,
  height: 42,
  textAlign: 'center',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  ':before': {
    content: '""',
    width: 22,
    height: 22,
    borderRadius: 11,
    display: 'block',
    background: 'currentColor',
  },
});

export const colorTrigger = style([
  colorDot,
  {
    border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
    selectors: {
      '&[data-active="true"]': {
        borderColor: cssVarV2('input/border/active'),
      },
    },
  },
]);

export const colorsRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  height: 54,

  selectors: {
    // TODO(@CatsJuice): this animation is conflicting with sub-menu height detection
    '&[data-enable-fold]': {
      height: 0,
      overflow: 'hidden',
      transition: 'all 0.23s ease',
    },
    '&[data-enable-fold][data-active="true"]': {
      height: 54,
    },
  },
});
