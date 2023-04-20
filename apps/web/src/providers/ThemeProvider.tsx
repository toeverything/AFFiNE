import type {
  AffineCssVariables,
  AffineTheme,
  ThemeProviderProps,
} from '@affine/component';
import { AffineMuiThemeProvider, getTheme, muiThemes } from '@affine/component';
import { GlobalStyles } from '@mui/material';
import kebabCase from 'kebab-case';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import type React from 'react';
import { memo, useEffect, useMemo, useState } from 'react';

import { useCurrentMode } from '../hooks/current/use-current-mode';

const CssVariablesInjector = memo<{
  theme: AffineTheme;
}>(function ThemeInjector({ theme }) {
  return (
    <GlobalStyles
      styles={{
        // '#__next': {
        //   ...globalThemeVariables(themeStyle),
        // },
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
  );
});

const ThemeProviderInner = memo<React.PropsWithChildren>(
  function ThemeProviderInner({ children }) {
    const { resolvedTheme: theme } = useTheme();
    const editorMode = useCurrentMode();
    // SSR will always render the light theme, so we need to defer the theme if user selected dark mode
    const [deferTheme, setDeferTheme] = useState<'light' | 'dark'>('light');

    const themeStyle = useMemo(
      () => getTheme(deferTheme, editorMode),
      [deferTheme, editorMode]
    );

    useEffect(() => {
      window.apis?.onThemeChange(theme === 'dark' ? 'dark' : 'light');
      setDeferTheme(theme === 'dark' ? 'dark' : 'light');
    }, [theme]);
    return (
      <AffineMuiThemeProvider theme={muiThemes}>
        <CssVariablesInjector theme={themeStyle} />
        {children}
      </AffineMuiThemeProvider>
    );
  }
);

const themes = ['dark', 'light'];

export const ThemeProvider = ({
  children,
  ...props
}: PropsWithChildren<ThemeProviderProps>) => {
  return (
    <NextThemeProvider themes={themes} enableSystem={true} {...props}>
      <ThemeProviderInner>{children}</ThemeProviderInner>
    </NextThemeProvider>
  );
};
