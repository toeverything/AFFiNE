import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

const headerHeight = createVar('headerHeight');
const wsSelectorHeight = createVar('wsSelectorHeight');
const searchHeight = createVar('searchHeight');

export const root = style({
  vars: {
    [headerHeight]: '44px',
    [wsSelectorHeight]: '48px',
    [searchHeight]: '44px',
  },
  width: '100dvw',
});
export const headerSettingRow = style({
  height: 56,
});
export const wsSelectorAndSearch = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 15,
  padding: '4px 16px 15px 16px',
});

export const float = style({
  position: 'fixed',
  top: 0,
  width: '100%',
  zIndex: 2,

  // visibility control
  background: 'transparent',
  selectors: {
    '&.dense': {
      background: cssVarV2('layer/background/mobile/primary'),
    },
  },
});
export const floatContent = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  height: 56,
  padding: '0 10px 0 16px',
  gap: 10,
  selectors: {
    [`${float}.dense &::after`]: {
      content: '',
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      height: '0.5px',
      background: cssVarV2('layer/insideBorder/border'),
    },
  },
});
export const headerAction = style({
  display: 'inline-flex',
  width: 44,
  height: 44,
  flex: '0 0 44px',
  alignItems: 'center',
  justifyContent: 'center',
});
export const floatWsSelector = style({
  width: 0,
  flex: 1,
  visibility: 'hidden',
  pointerEvents: 'none',
  selectors: {
    [`${float}.dense &`]: {
      visibility: 'visible',
      pointerEvents: 'auto',
    },
  },
});

export const notificationBadge = style({
  position: 'absolute',
  top: -2,
  right: -2,
  backgroundColor: cssVarV2('button/primary'),
  color: cssVarV2('text/pureWhite'),
  width: '16px',
  height: '16px',
  fontSize: '12px',
  lineHeight: '16px',
  borderRadius: '50%',
  textAlign: 'center',
});
