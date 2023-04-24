import type { AffineTheme } from './theme';

export type ThemeProviderProps = {
  defaultTheme?: Theme;
};

export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'auto';

declare module '@emotion/react' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface Theme extends AffineTheme {}
}
