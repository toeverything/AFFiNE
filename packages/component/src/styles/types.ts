import { EditorContainer } from '@blocksuite/editor';

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
  mode: Theme;
  editorMode: EditorContainer['mode'];
  colors: {
    primaryColor: string;

    pageBackground: string;
    popoverBackground: string;
    tooltipBackground: string;
    hoverBackground: string;
    innerHoverBackground: string;
    codeBackground: string;
    codeBlockBackground: string;
    // Use for blockHub and slide bar background
    hubBackground: string;
    cardHoverBackground: string;
    warningBackground: string;
    errorBackground: string;
    // Use for the page`s text
    textColor: string;
    secondaryTextColor: string;
    // Use for the editor`s text, because in edgeless mode text is different form other
    edgelessTextColor: string;
    linkColor: string;
    // In dark mode, normal text`s (not bold) color
    linkColor2: string;
    linkVisitedColor: string;
    iconColor: string;
    handleColor: string;
    popoverColor: string;
    inputColor: string;
    tooltipColor: string;
    codeColor: string;
    quoteColor: string;
    placeHolderColor: string;
    selectedColor: string;
    borderColor: string;
    disableColor: string;
    warningColor: string;
    errorColor: string;
    lineNumberColor: string;
  };
  font: {
    title: string;
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    h5: string;
    h6: string;
    base: string;
    sm: string; // small
    xs: string; // tiny

    family: string;
    numberFamily: string;
    codeFamily: string;

    lineHeight: string | number;
  };
  zIndex: {
    modal: number;
    popover: number;
  };
  shadow: {
    modal: string;
    popover: string;
    tooltip: string;
  };
  space: {
    paragraph: string;
  };
  radius: {
    popover: string;
  };
}

export interface AffineThemeCSSVariables {
  '--affine-theme-mode': Theme;
  '--affine-editor-mode': EditorContainer['mode'];

  '--affine-primary-color': AffineTheme['colors']['primaryColor'];
  '--affine-page-background': AffineTheme['colors']['pageBackground'];
  '--affine-popover-background': AffineTheme['colors']['popoverBackground'];
  '--affine-hover-background': AffineTheme['colors']['hoverBackground'];
  '--affine-code-background': AffineTheme['colors']['codeBackground'];

  '--affine-code-block-background': AffineTheme['colors']['codeBlockBackground'];
  '--affine-tooltip-background': AffineTheme['colors']['tooltipBackground'];

  '--affine-hub-background': AffineTheme['colors']['hubBackground'];
  '--affine-card-hover-background': AffineTheme['colors']['cardHoverBackground'];
  '--affine-text-color': AffineTheme['colors']['textColor'];
  '--affine-secondary-text-color': AffineTheme['colors']['secondaryTextColor'];
  '--affine-edgeless-text-color': AffineTheme['colors']['edgelessTextColor'];
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
  '--affine-border-color': AffineTheme['colors']['borderColor'];
  '--affine-disable-color': AffineTheme['colors']['disableColor'];
  '--affine-tooltip-color': AffineTheme['colors']['tooltipColor'];
  '--affine-line-number-color': AffineTheme['colors']['lineNumberColor'];

  '--affine-modal-shadow': AffineTheme['shadow']['modal'];
  '--affine-popover-shadow': AffineTheme['shadow']['popover'];
  '--affine-tooltip-shadow': AffineTheme['shadow']['tooltip'];
  '--affine-font-h1': AffineTheme['font']['h1'];
  '--affine-font-h2': AffineTheme['font']['h2'];
  '--affine-font-h3': AffineTheme['font']['h3'];
  '--affine-font-h4': AffineTheme['font']['h4'];
  '--affine-font-h5': AffineTheme['font']['h5'];
  '--affine-font-h6': AffineTheme['font']['h6'];
  '--affine-font-base': AffineTheme['font']['base'];
  '--affine-font-sm': AffineTheme['font']['sm']; // small
  '--affine-font-xs': AffineTheme['font']['xs']; // tiny
  '--affine-line-height': AffineTheme['font']['lineHeight'];

  '--affine-z-index-modal': AffineTheme['zIndex']['modal'];
  '--affine-z-index-popover': AffineTheme['zIndex']['popover'];

  '--affine-font-family': AffineTheme['font']['family'];
  '--affine-font-number-family': AffineTheme['font']['numberFamily'];
  '--affine-font-code-family': AffineTheme['font']['codeFamily'];

  '--affine-paragraph-space': AffineTheme['space']['paragraph'];

  '--affine-popover-radius': AffineTheme['radius']['popover'];
}

declare module '@emotion/react' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface Theme extends AffineTheme {}
}
