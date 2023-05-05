import type { ThemeProviderProps } from '@affine/component';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import type React from 'react';
import { memo, useEffect } from 'react';

const themes = ['dark', 'light'];

const DesktopThemeSync = memo(function DesktopThemeSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (environment.isDesktop) {
      window.apis?.onThemeChange(resolvedTheme === 'dark' ? 'dark' : 'light');
    }
  }, [resolvedTheme]);
  return null;
});

export const ThemeProvider = ({
  children,
  ...props
}: PropsWithChildren<ThemeProviderProps>) => {
  return (
    <NextThemeProvider themes={themes} enableSystem={true} {...props}>
      {children}
      <DesktopThemeSync />
    </NextThemeProvider>
  );
};
