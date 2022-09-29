export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'auto';

export type ThemeProviderProps = {
  defaultTheme?: Theme;
};

export type ThemeProviderValue = {
  theme: AffineTheme;
  mode: ThemeMode;
  changeMode: (newMode: ThemeMode) => void;
};

export interface AffineTheme {
  colors: {
    primary: string;
  };
}

declare module '@emotion/react' {
  export interface Theme extends AffineTheme {}
}
