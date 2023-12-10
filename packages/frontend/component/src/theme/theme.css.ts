import { darkCssVariables, lightCssVariables } from '@toeverything/theme';
import { globalStyle } from '@vanilla-extract/css';

globalStyle('body', {
  color: 'var(--affine-text-primary-color)',
  fontFamily: 'var(--affine-font-family)',
  fontSize: 'var(--affine-font-base)',
});

globalStyle('html', {
  vars: lightCssVariables,
});

globalStyle('html', {
  '@media': {
    '(prefers-color-scheme: dark)': {
      vars: darkCssVariables,
    },
  },
});

if (process.env.NODE_ENV === 'development') {
  globalStyle('.undefined', {
    border: '5px solid red !important',
  });
}
