import { headlineRegular } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { globalVars } from '../../../styles/variables.css';

export const scroller = style({
  width: '100%',
  height: `calc(100dvh - ${globalVars.appTabSafeArea})`,
  overflowX: 'hidden',
  overscrollBehavior: 'none',
  touchAction: 'pan-y',
});

export const virtuoso = style({
  overflowX: 'hidden',
  touchAction: 'pan-y',
});

export const list = style({
  boxSizing: 'border-box',
  width: '100%',
  padding: '0 8px 32px',
});

export const row = style({
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 44,
});

export const section = style({
  display: 'flex',
  alignItems: 'center',
  height: 33,
  padding: '0 16px 8px',
  color: cssVarV2.text.primary,
  selectors: {
    '&:not([data-first-section="true"])': {
      height: 65,
      paddingTop: 32,
    },
    '&[data-collapsed="true"]': {
      height: 25,
      paddingBottom: 0,
    },
    '&[data-collapsed="true"]:not([data-first-section="true"])': {
      height: 57,
    },
  },
});

export const sectionButton = style([
  headlineRegular,
  {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    width: '100%',
    border: 0,
    padding: 0,
    background: 'transparent',
    color: 'inherit',
    textAlign: 'left',
  },
]);

export const sectionCollapseIcon = style({
  width: 16,
  height: 16,
  color: cssVarV2.icon.tertiary,
  transform: 'translateY(1px) rotate(90deg)',
  transition: 'transform 0.2s',
  selectors: {
    [`${section}[data-collapsed="true"] &`]: {
      transform: 'translateY(1px) rotate(0deg)',
    },
  },
});

export const permission = style({
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  color: cssVarV2.text.secondary,
  fontSize: 13,
});

export const tagIcon = style({
  width: 14,
  height: 14,
  borderRadius: '50%',
});
