import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { globalVars } from '../../styles/mobile.css';

export const appTabs = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',

  backgroundColor: cssVarV2('layer/background/secondary'),
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,

  width: '100dvw',
  height: `calc(${globalVars.appTabHeight} + 2px)`,
  padding: 16,
  gap: 15.5,

  position: 'fixed',
  paddingBottom: 18,
  bottom: -2,
  zIndex: 1,
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
