import type { AffineCssVariables } from '@affine/component';
import { globalStyle } from '@vanilla-extract/css';
import kebabCase from 'kebab-case';

import { darkTheme, lightTheme } from '../styles/theme';

globalStyle('body', {
  color: 'var(--affine-text-primary-color)',
  fontFamily: 'var(--affine-font-family)',
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-font-height)',
});

globalStyle('html', {
  vars: {
    ...Object.entries(lightTheme).reduce((variables, [key, value]) => {
      variables[`--affine-${kebabCase(key)}` as keyof AffineCssVariables] =
        value;
      return variables;
    }, {} as AffineCssVariables),
  },
});

globalStyle('html[data-theme="dark"]', {
  vars: {
    ...Object.entries(darkTheme).reduce((variables, [key, value]) => {
      variables[`--affine-${kebabCase(key)}` as keyof AffineCssVariables] =
        value;
      return variables;
    }, {} as AffineCssVariables),
  },
});
