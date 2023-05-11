import type { ThemeProviderProps } from '@affine/component';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import { memo, useRef } from 'react';

const themes = ['dark', 'light'];

// a workaround to sync theme to electron
let firstRender = true;

const DesktopThemeSync = memo(function DesktopThemeSync() {
  const { theme } = useTheme();
  const lastThemeRef = useRef(theme);
  if (lastThemeRef.current !== theme || firstRender) {
    if (environment.isDesktop && theme) {
      window.apis?.ui.handleThemeChange(theme as 'dark' | 'light' | 'system');
    }
    lastThemeRef.current = theme;
    firstRender = false;
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
