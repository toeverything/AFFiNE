export * from './components/ListSkeleton';
export * from './styles';
export * from './ui/breadcrumbs';
export * from './ui/button';
export * from './ui/confirm';
export * from './ui/divider';
export * from './ui/empty';
export * from './ui/input';
export * from './ui/layout';
export * from './ui/menu';
export * from './ui/modal';
export * from './ui/mui';
export * from './ui/popper';
export * from './ui/shared/Container';
export * from './ui/switch';
export * from './ui/table';
export * from './ui/toast';
export * from './ui/tooltip';
export * from './ui/tree-view';

declare module '@mui/material/styles' {
  interface Theme {
    colors: {
      primaryColor: string;

      pageBackground: string;
      popoverBackground: string;
      tooltipBackground: string;
      hoverBackground: string;
      innerHoverBackground: string;
      modalBackground: string;
      // Use for the quick search tips background
      backgroundTertiaryColor: string;
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
      textEmphasisColor: string;
      // Use for the editor`s text, because in edgeless mode text is different form other
      edgelessTextColor: string;
      linkColor: string;
      // In dark mode, normal text`s (not bold) color
      linkColor2: string;
      linkVisitedColor: string;
      iconColor: string;
      handleColor: string;
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

  interface ThemeOptions {
    colors: {
      primaryColor: string;

      pageBackground: string;
      popoverBackground: string;
      tooltipBackground: string;
      hoverBackground: string;
      innerHoverBackground: string;
      modalBackground: string;
      // Use for the quick search tips background
      backgroundTertiaryColor: string;
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
      textEmphasisColor: string;
      // Use for the editor`s text, because in edgeless mode text is different form other
      edgelessTextColor: string;
      linkColor: string;
      // In dark mode, normal text`s (not bold) color
      linkColor2: string;
      linkVisitedColor: string;
      iconColor: string;
      handleColor: string;
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
}
