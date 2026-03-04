import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { PropsWithChildren } from 'react';

const themes = ['dark', 'light'];

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  return (
    <NextThemeProvider
      themes={themes}
      enableSystem={true}
      defaultTheme="system"
    >
      {children}
    </NextThemeProvider>
  );
};
