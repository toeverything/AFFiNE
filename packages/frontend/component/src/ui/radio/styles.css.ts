import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle, style } from '@vanilla-extract/css';

export const outerPadding = createVar('radio-outer-padding');
export const outerRadius = createVar('radio-outer-radius');
export const itemGap = createVar('radio-item-gap');
export const itemHeight = createVar('radio-item-height');

export const radioButton = style({
  flex: 1,
  position: 'relative',
  borderRadius: `calc(${outerRadius} - ${outerPadding})`,
  height: itemHeight,
  padding: '4px 8px',
  fontSize: cssVar('fontXs'),
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  color: cssVarV2('switch/fontColor/tertiary'),
  whiteSpace: 'nowrap',
  userSelect: 'none',
  fontWeight: 600,
  selectors: {
    '&[data-state="checked"]': {
      color: cssVarV2('switch/fontColor/primary'),
    },
    '&[data-state="unchecked"]:hover:not([disabled])': {
      background: cssVarV2('switch/buttonBackground/hover'),
    },
    '[data-icon-mode=true] &': {
      color: cssVarV2('switch/iconColor/default'),
    },
    '[data-icon-mode=true] &[data-state="checked"]': {
      color: cssVarV2('switch/iconColor/active'),
    },
  },
});
export const radioButtonContent = style({
  zIndex: 1,
  display: 'block',
});
globalStyle(`${radioButtonContent} > svg`, { display: 'block' });
export const radioButtonGroup = style({
  display: 'inline-flex',
  alignItems: 'center',
  background: cssVarV2('switch/switchBackground/background'),

  borderRadius: outerRadius,
  padding: outerPadding,
  gap: itemGap,

  // @ts-expect-error - fix electron drag
  WebkitAppRegion: 'no-drag',
});
export const indicator = style({
  position: 'absolute',
  borderRadius: 'inherit',
  width: '100%',
  height: '100%',
  left: 0,
  top: 0,
  background: cssVarV2('switch/buttonBackground/active'),
  boxShadow: cssVar('buttonShadow'),
  opacity: 0,
  transformOrigin: 'left',
  selectors: {
    '[data-state="checked"] > &': {
      opacity: 1,
    },
  },
});
