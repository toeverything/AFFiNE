import { cssVar } from '@toeverything/theme';
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
  color: cssVar('textSecondaryColor'),
  whiteSpace: 'nowrap',
  userSelect: 'none',
  fontWeight: 600,
  selectors: {
    '&[data-state="checked"]': {
      color: cssVar('textPrimaryColor'),
    },
    '&[data-state="unchecked"]:hover': {
      background: cssVar('hoverColor'),
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
  background: cssVar('hoverColorFilled'),

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
  background: cssVar('white'),
  filter: 'drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.1))',
  opacity: 0,
  transformOrigin: 'left',
  selectors: {
    '[data-state="checked"] > &': {
      opacity: 1,
    },
  },
});
