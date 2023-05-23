import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import { memo, useRef } from 'react';

const themes = ['dark', 'light'];

const DesktopThemeSync = memo(function DesktopThemeSync() {
  const { theme } = useTheme();
  const lastThemeRef = useRef(theme);
  const onceRef = useRef(false);
  if (lastThemeRef.current !== theme || !onceRef.current) {
    if (environment.isDesktop && theme) {
      window.apis?.ui.handleThemeChange(theme as 'dark' | 'light' | 'system');
    }
    lastThemeRef.current = theme;
    onceRef.current = true;
  }
  return null;
});

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  return (
    <NextThemeProvider themes={themes} enableSystem={true}>
      {children}
      <DesktopThemeSync />
    </NextThemeProvider>
  );
};
