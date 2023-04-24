import type { AffineCssVariables } from '@affine/component';
import { globalStyle } from '@vanilla-extract/css';

import { darkTheme, lightTheme } from '../styles/theme';

const camelToKebab = (s: string) => {
  if (typeof s !== 'string') return '';
  return s
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z])(?=[a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/(\D+)(\d+)$/g, '$1-$2')
    .replace(/\s|_/g, '-');
};

globalStyle('body', {
  color: 'var(--affine-text-primary-color)',
  fontFamily: 'var(--affine-font-family)',
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-font-height)',
});

globalStyle('html', {
  vars: {
    ...Object.entries(lightTheme).reduce((variables, [key, value]) => {
      variables[`--affine-${camelToKebab(key)}` as keyof AffineCssVariables] =
        value;
      return variables;
    }, {} as AffineCssVariables),
  },
});

globalStyle('html[data-theme="dark"]', {
  vars: {
    ...Object.entries(darkTheme).reduce((variables, [key, value]) => {
      variables[`--affine-${camelToKebab(key)}` as keyof AffineCssVariables] =
        value;
      return variables;
    }, {} as AffineCssVariables),
  },
});
