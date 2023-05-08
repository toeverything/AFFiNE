import { CssBaseline } from '@mui/material';
import {
  alpha,
  createTheme as createMuiTheme,
  css,
  keyframes,
  styled,
  type ThemeOptions,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

export { alpha, css, keyframes, styled };

export const AffineMuiThemeProvider = ({
  theme,
  children,
}: PropsWithChildren<{
  theme: ThemeOptions;
}>) => {
  const muiTheme = useMemo(() => createMuiTheme(theme), [theme]);
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};
