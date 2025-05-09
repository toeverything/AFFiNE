import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/variables.css';

export const appTabsBackground = createVar('appTabsBackground');

export const appTabs = style({
  vars: {
    [appTabsBackground]: cssVarV2.layer.background.mobile.primary,
  },
  backgroundColor: appTabsBackground,
  borderTop: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,

  width: '100dvw',

  zIndex: 1,

  marginBottom: -2,
  selectors: {
    '&[data-fixed="true"]': {
      position: 'fixed',
      bottom: -2,
      marginBottom: 0,
    },
  },
});
export const appTabsInner = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 15.5,

  height: `calc(${globalVars.appTabHeight} + 2px)`,
  padding: '13px 16px',
});
export const tabItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 0,
  flex: 1,
  height: 36,
  padding: 3,
  fontSize: 30,
  color: cssVarV2.icon.primary,
  lineHeight: 0,

  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2.button.primary,
    },
  },
});
