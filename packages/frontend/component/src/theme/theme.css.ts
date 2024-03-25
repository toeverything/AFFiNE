import {
  cssVar,
  darkCssVariables,
  lightCssVariables,
} from '@toeverything/theme';
import { globalStyle } from '@vanilla-extract/css';
globalStyle('body', {
  color: cssVar('textPrimaryColor'),
  fontFamily: cssVar('fontFamily'),
  fontSize: cssVar('fontBase'),
});
globalStyle('html', {
  vars: lightCssVariables,
});
globalStyle('html[data-theme="dark"]', {
  vars: darkCssVariables,
});
if (process.env.NODE_ENV === 'development') {
  globalStyle('.undefined', {
    border: '5px solid red !important',
  });
}
