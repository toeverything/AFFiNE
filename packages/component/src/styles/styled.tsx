import { CssBaseline } from '@mui/material';
import {
  createTheme as createMuiTheme,
  css,
  keyframes,
  styled,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

import { AffineTheme } from './types';

export { css, keyframes, styled };

export const ThemeProvider = ({
  theme,
  children,
}: PropsWithChildren<{
  theme: AffineTheme;
}>) => {
  const muiTheme = useMemo(() => createMuiTheme(theme), [theme]);
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};
