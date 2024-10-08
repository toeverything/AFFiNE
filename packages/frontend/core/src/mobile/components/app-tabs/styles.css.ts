import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/mobile.css';

export const appTabs = style({
  backgroundColor: cssVarV2('layer/background/secondary'),
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,

  width: '100dvw',

  position: 'fixed',
  bottom: -2,
  zIndex: 1,
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
  color: cssVarV2('icon/primary'),
  lineHeight: 0,

  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('button/primary'),
    },
  },
});
