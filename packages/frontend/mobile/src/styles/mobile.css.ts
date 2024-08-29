import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle } from '@vanilla-extract/css';

export const globalVars = {
  appTabHeight: createVar('appTabHeight'),
};

globalStyle(':root', {
  vars: {
    [globalVars.appTabHeight]: '68px',
  },
});

globalStyle('body', {
  height: 'auto',
});
globalStyle('body:has(#app-tabs)', {
  paddingBottom: globalVars.appTabHeight,
});
globalStyle('html', {
  overflowY: 'auto',
  background: cssVarV2('layer/background/secondary'),
});
