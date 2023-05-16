import { darkCssVariables, lightCssVariables } from '@toeverything/theme';
import { globalStyle } from '@vanilla-extract/css';

globalStyle('body', {
  color: 'var(--affine-text-primary-color)',
  fontFamily: 'var(--affine-font-family)',
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-font-height)',
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
