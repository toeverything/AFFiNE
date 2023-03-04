import { AffineTheme, ThemeProviderProps } from '@affine/component';
import {
  getDarkTheme,
  getLightTheme,
  globalThemeVariables,
  ThemeProvider as AffineThemeProvider,
} from '@affine/component';
import { GlobalStyles } from '@mui/material';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import React, { memo, useMemo } from 'react';

import { useCurrentPageId } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { usePageMeta } from '../hooks/use-page-meta';

const ThemeInjector = React.memo<{
  themeStyle: AffineTheme;
}>(function ThemeInjector({ themeStyle }) {
  return (
    <GlobalStyles
      styles={{
        ':root': globalThemeVariables(themeStyle) as any,
      }}
    />
  );
});

const ThemeProviderInner = memo<React.PropsWithChildren>(
  function ThemeProviderInner({ children }) {
    const { resolvedTheme } = useTheme();
    const [currentWorkspace] = useCurrentWorkspace();
    const [currentPage] = useCurrentPageId();
    const pageMeta = usePageMeta(currentWorkspace?.blockSuiteWorkspace ?? null);
    const editorMode =
      pageMeta.find(page => page.id === currentPage)?.mode ?? 'page';
    const themeStyle = useMemo(() => getLightTheme(editorMode), [editorMode]);
    const darkThemeStyle = useMemo(
      () => getDarkTheme(editorMode),
      [editorMode]
    );
    return (
      <AffineThemeProvider
        theme={resolvedTheme === 'dark' ? darkThemeStyle : themeStyle}
      >
        <ThemeInjector
          themeStyle={resolvedTheme === 'dark' ? darkThemeStyle : themeStyle}
        />
        {children}
      </AffineThemeProvider>
    );
  }
);

export const ThemeProvider = ({
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  return (
    <NextThemeProvider>
      <ThemeProviderInner>{children}</ThemeProviderInner>
    </NextThemeProvider>
  );
};
