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
    primaryColor: string;

    pageBackground: string;
    popoverBackground: string;
    hoverBackground: string;
    codeBackground: string;

    textColor: string;
    linkColor: string;
    // In dark mode, normal text`s (not bold) color
    linkColor2: string;
    linkVisitedColor: string;
    iconColor: string;
    popoverColor: string;
    codeColor: string;
    quoteColor: string;
    placeHolderColor: string;
    selectedColor: string;
  };
  font: {
    xs: string; // tiny
    sm: string; // small
    base: string;

    family: string;
    family2: string;
  };
  zIndex: {
    modal: number;
    popover: number;
  };
  shadow: {
    modal: string;
    popover: string;
  };
}

export interface AffineThemeCSSVariables {
  '--affine-primary-color': AffineTheme['colors']['primaryColor'];
  '--affine-page-background': AffineTheme['colors']['pageBackground'];
  '--affine-popover-background': AffineTheme['colors']['popoverBackground'];
  '--affine-hover-background': AffineTheme['colors']['hoverBackground'];
  '--affine-code-background': AffineTheme['colors']['codeBackground'];

  '--affine-text-color': AffineTheme['colors']['textColor'];
  '--affine-link-color': AffineTheme['colors']['linkColor'];
  // In dark mode, normal text`s (not bold) color
  '--affine-link-color2': AffineTheme['colors']['linkColor2'];
  '--affine-link-visited-color': AffineTheme['colors']['linkVisitedColor'];
  '--affine-icon-color': AffineTheme['colors']['iconColor'];
  '--affine-popover-color': AffineTheme['colors']['popoverColor'];
  '--affine-code-color': AffineTheme['colors']['codeColor'];
  '--affine-quote-color': AffineTheme['colors']['quoteColor'];
  '--affine-placeholder-color': AffineTheme['colors']['placeHolderColor'];
  '--affine-selected-color': AffineTheme['colors']['selectedColor'];

  '--affine-modal-shadow': AffineTheme['shadow']['popover'];
  '--affine-popover-shadow': AffineTheme['shadow']['modal'];

  '--affine-font-xs': AffineTheme['font']['xs']; // tiny
  '--affine-font-sm': AffineTheme['font']['sm']; // small
  '--affine-font-base': AffineTheme['font']['base'];

  '--affine-z-index-modal': AffineTheme['zIndex']['modal'];
  '--affine-z-index-popover': AffineTheme['zIndex']['popover'];

  '--affine-font-family': AffineTheme['font']['family'];
  '--affine-font-family2': AffineTheme['font']['family2'];
}

declare module '@emotion/react' {
  export interface Theme extends AffineTheme {}
}
