import '@emotion/react';
import { AffineTheme, AffineThemeCSSVariables, ThemeMode } from './types';
import { EditorContainer } from '@blocksuite/editor';

const basicFontFamily =
  'apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji';

export const getLightTheme = (
  editorMode: EditorContainer['mode']
): AffineTheme => {
  return {
    mode: 'light',
    editorMode,
    colors: {
      primaryColor: '#6880FF',

      pageBackground: '#fff',
      hoverBackground: '#F1F3FF',
      popoverBackground: '#fff',
      toolTipBackground: '#6880FF',
      codeBackground: '#f2f5f9',
      warningBackground: '#FFF9C7',

      textColor: '#3A4C5C',
      edgelessTextColor: '#3A4C5C',
      iconColor: '#9096A5',
      linkColor: '#6880FF',
      linkColor2: '#6880FF',
      linkVisitedColor: '#ABB8FE',
      popoverColor: '#4C6275',
      codeColor: '#517ea6',
      quoteColor: '#4C6275',
      placeHolderColor: '#C7C7C7',
      selectedColor: 'rgba(104, 128, 255, 0.1)',
      borderColor: '#D0D7E3',
      disableColor: '#C0C0C0',
      warningColor: '#906616',
    },
    font: {
      xs: '12px',
      sm: '16px',
      base: '18px',
      family: `Avenir Next, Poppins, ${basicFontFamily}`,
      family2: `Space Mono, ${basicFontFamily}`,
      lineHeightBase: '26px',
    },
    zIndex: {
      modal: 1000,
      popover: 100,
    },
    shadow: {
      popover:
        '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06);',
      modal:
        '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06);',
      tooltip: '1px 1px 4px rgba(0, 0, 0, 0.14)',
    },
    space: {
      paragraph: '8px',
    },
    radius: {
      popover: '10px',
    },
  };
};

export const getDarkTheme = (
  editorMode: EditorContainer['mode']
): AffineTheme => {
  const lightTheme = getLightTheme(editorMode);

  return {
    ...lightTheme,
    mode: 'dark',
    colors: {
      primaryColor: '#6880FF',

      pageBackground: '#2c2c2c',
      hoverBackground: '#3C3C42',
      popoverBackground: '#1F2021',
      codeBackground:
        editorMode === 'edgeless'
          ? lightTheme.colors.codeBackground
          : '#505662',
      toolTipBackground: '#1F2021',
      warningBackground: '#FFF9C7',

      textColor: '#fff',
      edgelessTextColor: '#3A4C5C',
      iconColor: '#9096A5',
      linkColor: '#7D91FF',
      linkColor2: '#6880FF',
      linkVisitedColor: '#505FAB',
      popoverColor: '#C6CBD9',
      codeColor:
        editorMode === 'edgeless' ? lightTheme.colors.codeColor : '#BDDBFD',
      quoteColor: '#C6CBD9',
      placeHolderColor: '#C7C7C7',
      selectedColor: 'rgba(104, 128, 255, 0.1)',
      borderColor: '#4D4C53',
      disableColor: '#4b4b4b',
      warningColor: '#906616',
    },
    shadow: {
      popover:
        '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
      modal:
        '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
      tooltip: '1px 1px 4px rgba(0, 0, 0, 0.14)',
    },
  };
};

export const globalThemeVariables: (
  mode: ThemeMode,
  theme: AffineTheme
) => AffineThemeCSSVariables = (mode, theme) => {
  return {
    '--affine-theme-mode': theme.mode,
    '--affine-editor-mode': theme.editorMode,

    '--affine-primary-color': theme.colors.primaryColor,

    '--affine-page-background': theme.colors.pageBackground,
    '--affine-popover-background': theme.colors.popoverBackground,
    '--affine-hover-background': theme.colors.hoverBackground,
    '--affine-code-background': theme.colors.codeBackground,
    '--affine-tooltip-background': theme.colors.toolTipBackground,

    '--affine-text-color': theme.colors.textColor,
    '--affine-edgeless-text-color': theme.colors.edgelessTextColor,
    '--affine-link-color': theme.colors.linkColor,
    // In dark mode, normal text`s (not bold) color
    '--affine-link-color2': theme.colors.linkColor2,
    '--affine-link-visited-color': theme.colors.linkVisitedColor,
    '--affine-icon-color': theme.colors.iconColor,
    '--affine-popover-color': theme.colors.popoverColor,
    '--affine-code-color': theme.colors.codeColor,
    '--affine-quote-color': theme.colors.quoteColor,
    '--affine-selected-color': theme.colors.selectedColor,
    '--affine-placeholder-color': theme.colors.placeHolderColor,
    '--affine-border-color': theme.colors.borderColor,
    '--affine-disable-color': theme.colors.disableColor,

    '--affine-modal-shadow': theme.shadow.modal,
    '--affine-popover-shadow': theme.shadow.popover,
    '--affine-tooltip-shadow': theme.shadow.tooltip,

    '--affine-font-xs': theme.font.xs, // tiny
    '--affine-font-sm': theme.font.sm, // small
    '--affine-font-base': theme.font.base,
    '--affine-line-height-base': theme.font.lineHeightBase,

    '--affine-z-index-modal': theme.zIndex.modal,
    '--affine-z-index-popover': theme.zIndex.popover,

    '--affine-font-family': theme.font.family,
    '--affine-font-family2': theme.font.family2,

    '--affine-paragraph-space': theme.space.paragraph,
    '--affine-popover-radius': theme.radius.popover,
  };
};
