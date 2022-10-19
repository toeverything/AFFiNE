import '@emotion/react';
import { AffineTheme, AffineThemeCSSVariables, ThemeMode } from './types';

const basicFontFamily =
  'apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji';

export const lightTheme: AffineTheme = {
  colors: {
    primaryColor: '#6880FF',

    pageBackground: '#fff',
    hoverBackground: '#F1F3FF',
    popoverBackground: '#fff',
    codeBackground: '#f2f5f9',

    textColor: '#3A4C5C',
    iconColor: '#9096A5',
    linkColor: '#6880FF',
    linkColor2: '#6880FF',
    linkVisitedColor: '#ABB8FE',
    popoverColor: '#4C6275',
    codeColor: '#517ea6',
    quoteColor: '#4C6275',
    placeHolderColor: '#C7C7C7',
    selectedColor: 'rgba(104, 128, 255, 0.1)',
  },
  font: {
    xs: '12px',
    sm: '16px',
    base: '18px',
    family: `Avenir Next, ${basicFontFamily}`,
    family2: `Roboto Mono, ${basicFontFamily}`,
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
  },
};

export const darkTheme: AffineTheme = {
  ...lightTheme,
  colors: {
    primaryColor: '#6880FF',

    pageBackground: '#2c2c2c',
    hoverBackground: '#3C3C42',
    popoverBackground: '#1F2021',
    codeBackground: '#505662',

    textColor: '#fff',
    iconColor: '#9096A5',
    linkColor: '#6880FF',
    linkColor2: '#7D91FF',
    linkVisitedColor: '#505FAB',
    popoverColor: '#A9B1C6',
    codeColor: '#BDDBFD',
    quoteColor: '#A9B1C6',
    placeHolderColor: '#C7C7C7',
    selectedColor: 'rgba(240, 242, 255, 0.8)',
  },
  shadow: {
    popover:
      '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
    modal:
      '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
  },
};

export const globalThemeVariables: (
  mode: ThemeMode,
  theme: AffineTheme
) => AffineThemeCSSVariables = (mode, theme) => {
  return {
    '--affine-primary-color': theme.colors.primaryColor,

    '--affine-page-background': theme.colors.pageBackground,
    '--affine-popover-background': theme.colors.popoverBackground,
    '--affine-hover-background': theme.colors.hoverBackground,
    '--affine-code-background': theme.colors.codeBackground,

    '--affine-text-color': theme.colors.textColor,
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

    '--affine-modal-shadow': theme.shadow.modal,
    '--affine-popover-shadow': theme.shadow.popover,

    '--affine-font-xs': theme.font.xs, // tiny
    '--affine-font-sm': theme.font.sm, // small
    '--affine-font-base': theme.font.base,

    '--affine-z-index-modal': theme.zIndex.modal,
    '--affine-z-index-popover': theme.zIndex.popover,

    '--affine-font-family': theme.font.family,
    '--affine-font-family2': theme.font.family2,
  };
};
