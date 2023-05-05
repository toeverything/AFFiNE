import type { ThemeProviderProps } from '@affine/component';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import type React from 'react';
import { memo, useRef } from 'react';

const themes = ['dark', 'light'];

const DesktopThemeSync = memo(function DesktopThemeSync() {
  const { theme } = useTheme();
  const lastThemeRef = useRef(theme);
  if (lastThemeRef.current !== theme) {
    if (environment.isDesktop && theme) {
      window.apis?.onThemeChange(theme);
    }
    lastThemeRef.current = theme;
  }
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
