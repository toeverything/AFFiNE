export type ThemeMode = 'light' | 'dark';

export type ThemeProviderProps = {
  defaultThemeMode?: ThemeMode;
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
