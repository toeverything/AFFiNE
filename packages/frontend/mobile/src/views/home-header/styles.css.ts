import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

const headerHeight = createVar('headerHeight');
const wsSelectorHeight = createVar('wsSelectorHeight');
const searchHeight = createVar('searchHeight');

const searchPadding = [10, 16, 15, 16];

export const root = style({
  vars: {
    [headerHeight]: '44px',
    [wsSelectorHeight]: '48px',
    [searchHeight]: '44px',
  },
  width: '100vw',
});
export const float = style({
  // why not 'sticky'?
  // when height change, will affect scroll behavior, causing shaking
  position: 'fixed',
  top: 0,
  width: '100%',
  background: cssVarV2('layer/background/secondary'),
  zIndex: 1,
});
export const space = style({
  height: `calc(${headerHeight} + ${wsSelectorHeight} + ${searchHeight} + ${searchPadding[0] + searchPadding[2]}px + 12px)`,
});

export const headerAndWsSelector = style({
  display: 'flex',
  gap: 10,
  alignItems: 'end',
  transition: 'height 0.2s',
  height: `calc(${headerHeight} + ${wsSelectorHeight})`,

  selectors: {
    [`${root}.dense &`]: {
      height: wsSelectorHeight,
    },
  },
});

export const wsSelectorWrapper = style({
  width: 0,
  flex: 1,
  height: wsSelectorHeight,
  padding: '0 10px 0 16px',
  display: 'flex',
  alignItems: 'center',
});

export const settingWrapper = style({
  width: '44px',
  height: headerHeight,
  transition: 'height 0.2s',

  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  alignSelf: 'start',

  selectors: {
    [`${root}.dense &`]: {
      height: wsSelectorHeight,
    },
  },
});

export const searchWrapper = style({
  padding: searchPadding.map(v => `${v}px`).join(' '),
  width: '100%',
  height: 44 + searchPadding[0] + searchPadding[2],
  transition: 'all 0.2s',
  overflow: 'hidden',
  selectors: {
    [`${root}.dense &`]: {
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
    },
  },
});
