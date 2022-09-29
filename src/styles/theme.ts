import '@emotion/react';
import { AffineTheme } from './types';

export const lightTheme: AffineTheme = {
  colors: {
    primary: '#0070f3',
  },
};

export const darkTheme: AffineTheme = {
  colors: {
    primary: '#000',
  },
};

export const globalThemeConstant = (theme: AffineTheme) => {
  return {
    '--color-primary': theme.colors.primary,
  };
};
