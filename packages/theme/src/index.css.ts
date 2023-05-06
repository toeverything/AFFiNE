import { globalStyle } from '@vanilla-extract/css';

import { darkCssVariables, lightCssVariables } from './index';

globalStyle(':root', {
  vars: lightCssVariables,
});

globalStyle(':root[data-theme="dark"]', {
  vars: darkCssVariables,
});
