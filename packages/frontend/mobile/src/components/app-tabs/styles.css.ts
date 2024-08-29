import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/mobile.css';

export const appTabs = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',

  backgroundColor: cssVarV2('layer/background/secondary'),
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,

  width: '100vw',
  height: globalVars.appTabHeight,
  padding: 16,
  gap: 15.5,

  position: 'fixed',
  bottom: 0,
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

  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('button/primary'),
    },
  },
});
