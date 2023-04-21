import type { ThemeProviderProps } from '@affine/component';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { PropsWithChildren } from 'react';
import type React from 'react';

const themes = ['dark', 'light'];

export const ThemeProvider = ({
  children,
  ...props
}: PropsWithChildren<ThemeProviderProps>) => {
  return (
    <NextThemeProvider themes={themes} enableSystem={true} {...props}>
      {children}
    </NextThemeProvider>
  );
};
