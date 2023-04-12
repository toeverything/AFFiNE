import type {
  AffineNextCssVariables,
  AffineNextLightColorScheme,
  AffineTheme,
  ThemeProviderProps,
} from '@affine/component';
import {
  getDarkTheme,
  getLightTheme,
  globalThemeVariables,
  nextDarkColorScheme,
  nextLightColorScheme,
  ThemeProvider as AffineThemeProvider,
} from '@affine/component';
import { GlobalStyles } from '@mui/material';
import kebabCase from 'kebab-case';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import type React from 'react';
import { memo, useEffect, useMemo, useState } from 'react';

import { useCurrentMode } from '../hooks/current/use-current-mode';

const ThemeInjector = memo<{
  themeStyle: AffineTheme;
  nextThemeStyle: AffineNextLightColorScheme;
}>(function ThemeInjector({ themeStyle, nextThemeStyle }) {
  const injectAffineNextTheme = useMemo(() => {
    return Object.entries(nextThemeStyle).reduce((variables, [key, value]) => {
      variables[`--affine-${kebabCase(key)}` as keyof AffineNextCssVariables] =
        value;
      return variables;
    }, {} as AffineNextCssVariables);
  }, [nextThemeStyle]);
  return (
    <GlobalStyles
      styles={{
        // '#__next': {
        //   ...globalThemeVariables(themeStyle),
        // },
        ':root': {
          ...globalThemeVariables(themeStyle),
          ...injectAffineNextTheme,
        },
        html: {
          fontFamily: themeStyle.font.family,
          fontSize: themeStyle.font.base,
          lineHeight: themeStyle.font.lineHeight,
        },
      }}
    />
  );
});

const ThemeProviderInner = memo<React.PropsWithChildren>(
  function ThemeProviderInner({ children }) {
    const { resolvedTheme: theme } = useTheme();
    const editorMode = useCurrentMode();
    const themeStyle = useMemo(() => getLightTheme(editorMode), [editorMode]);
    const darkThemeStyle = useMemo(
      () => getDarkTheme(editorMode),
      [editorMode]
    );
    // SSR will always render the light theme, so we need to defer the theme if user selected dark mode
    const [deferTheme, setDeferTheme] = useState('light');
    useEffect(() => {
      window.apis?.onThemeChange(theme === 'dark' ? 'dark' : 'light');
      setDeferTheme(theme === 'dark' ? 'dark' : 'light');
    }, [theme]);
    return (
      <AffineThemeProvider
        theme={deferTheme === 'dark' ? darkThemeStyle : themeStyle}
      >
        <ThemeInjector
          themeStyle={deferTheme === 'dark' ? darkThemeStyle : themeStyle}
          nextThemeStyle={
            deferTheme === 'dark' ? nextDarkColorScheme : nextLightColorScheme
          }
        />
        {children}
      </AffineThemeProvider>
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
