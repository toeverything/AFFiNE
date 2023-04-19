import React, { useMemo } from 'react';
import '@blocksuite/editor/themes/affine.css';
import '../src/theme/global.css';

import {
  AffineCssVariables,
  AffineMuiThemeProvider,
  getTheme,
  muiThemes,
} from '@affine/component';
import { useDarkMode } from 'storybook-dark-mode';
import { GlobalStyles } from '@mui/material';
import kebabCase from 'kebab-case';
export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

export const decorators = [
  (Story: React.ComponentType) => {
    const isDark = useDarkMode();

    const theme = useMemo(
      () => getTheme(isDark ? 'dark' : 'light', 'page'),
      [isDark]
    );
    return (
      <AffineMuiThemeProvider theme={muiThemes}>
        <GlobalStyles
          styles={{
            ':root': {
              ...Object.entries(theme).reduce((variables, [key, value]) => {
                variables[
                  `--affine-${kebabCase(key)}` as keyof AffineCssVariables
                ] = value;
                return variables;
              }, {} as AffineCssVariables),
            },
            html: {
              fontFamily: theme.fontFamily,
              fontSize: theme.fontBase,
              lineHeight: theme.lineHeight,
            },
          }}
        />
        <Story />
      </AffineMuiThemeProvider>
    );
  },
];
