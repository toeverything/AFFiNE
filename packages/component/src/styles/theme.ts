import '@emotion/react';

import type { EditorContainer } from '@blocksuite/editor';

import { AffineTheme, AffineThemeCSSVariables, ThemeMode } from './types';

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
      innerHoverBackground: '#E9E9EC',
      popoverBackground: '#fff',
      tooltipBackground: '#6880FF',
      codeBackground: '#f2f5f9',
      codeBlockBackground: '#F9F9FB',
      hubBackground: '#fbfbfc',
      cardHoverBackground: '#f8f9ff',
      warningBackground: '#FFF9C7',
      errorBackground: '#FFDED8',

      textColor: '#424149',
      secondaryTextColor: '#8E8D91',
      edgelessTextColor: '#3A4C5C',
      iconColor: '#77757D',
      handleColor: '#c7c3d9',
      linkColor: '#6880FF',
      linkColor2: '#6880FF',
      linkVisitedColor: '#ABB8FE',
      popoverColor: '#4C6275',
      inputColor: '#4C6275',
      tooltipColor: '#fff',
      codeColor: '#517ea6',
      quoteColor: '#645F82',
      placeHolderColor: '#C0BFC1',
      selectedColor: 'rgba(104, 128, 255, 0.1)',
      borderColor: '#E3E2E4',
      disableColor: '#A9A9AD',
      warningColor: '#906616',
      errorColor: '#EB4335',
      lineNumberColor: '#77757D',
    },
    font: {
      title: '36px',
      h1: '28px',
      h2: '26px',
      h3: '24px',
      h4: '22px',
      h5: '20px',
      h6: '18px',
      base: '16px',
      sm: '14px',
      xs: '12px',

      family: `Avenir Next, Poppins, ${basicFontFamily}`,
      numberFamily: `Roboto Mono, ${basicFontFamily}`,
      codeFamily: `Space Mono, Consolas, Menlo, Monaco, Courier, monospace, ${basicFontFamily}`,
      lineHeight: 'calc(1em + 8px)',
    },
    zIndex: {
      modal: 1000,
      popover: 100,
    },
    shadow: {
      popover:
        '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06)',
      modal:
        '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06)',
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
      innerHoverBackground: '#5A5A5A',
      popoverBackground: '#1F2021',
      tooltipBackground: '#0C0A15',
      codeBackground:
        editorMode === 'edgeless'
          ? lightTheme.colors.codeBackground
          : '#505662',
      codeBlockBackground: '#36383D',
      hubBackground: '#272727',
      cardHoverBackground: '#363636',
      warningBackground: '#FFF9C7',
      errorBackground: '#FFDED8',

      textColor: '#fff',
      secondaryTextColor: '#8E8D91',
      edgelessTextColor: '#3A4C5C',
      iconColor: '#77757D',
      handleColor: '#c7c3d9',
      linkColor: '#7D91FF',
      linkColor2: '#0C0A15',
      linkVisitedColor: '#505FAB',
      popoverColor: '#C6CBD9',
      inputColor: '#C6CBD9',
      tooltipColor: '#fff',
      codeColor:
        editorMode === 'edgeless' ? lightTheme.colors.codeColor : '#BDDBFD',
      quoteColor: '#C6CBD9',
      placeHolderColor: '#C7C7C7',
      selectedColor: 'rgba(104, 128, 255, 0.1)',
      borderColor: '#3C3A40',
      disableColor: '#4b4b4b',
      warningColor: '#906616',
      errorColor: '#EB4335',
      lineNumberColor: '#888A9E',
    },
    shadow: {
      popover:
        '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
      modal: '0px 4px 24px #161616',

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
    '--affine-tooltip-background': theme.colors.tooltipBackground,

    '--affine-hub-background': theme.colors.hubBackground,
    '--affine-card-hover-background': theme.colors.cardHoverBackground,

    '--affine-text-color': theme.colors.textColor,
    '--affine-secondary-text-color': theme.colors.secondaryTextColor,
    '--affine-edgeless-text-color': theme.colors.edgelessTextColor,
    '--affine-link-color': theme.colors.linkColor,
    // In dark mode, normal text`s (not bold) color
    '--affine-link-color2': theme.colors.linkColor2,
    '--affine-link-visited-color': theme.colors.linkVisitedColor,
    '--affine-icon-color': theme.colors.iconColor,
    '--affine-block-handle-color': theme.colors.handleColor,
    '--affine-popover-color': theme.colors.popoverColor,
    '--affine-input-color': theme.colors.inputColor,
    '--affine-code-color': theme.colors.codeColor,
    '--affine-code-block-background': theme.colors.codeBlockBackground,
    '--affine-quote-color': theme.colors.quoteColor,
    '--affine-selected-color': theme.colors.selectedColor,
    '--affine-placeholder-color': theme.colors.placeHolderColor,
    '--affine-border-color': theme.colors.borderColor,
    '--affine-disable-color': theme.colors.disableColor,
    '--affine-tooltip-color': theme.colors.tooltipColor,
    '--affine-line-number-color': theme.colors.lineNumberColor,

    '--affine-modal-shadow': theme.shadow.modal,
    '--affine-popover-shadow': theme.shadow.popover,
    '--affine-tooltip-shadow': theme.shadow.tooltip,

    '--affine-font-h1': theme.font.h1,
    '--affine-font-h2': theme.font.h2,
    '--affine-font-h3': theme.font.h3,
    '--affine-font-h4': theme.font.h4,
    '--affine-font-h5': theme.font.h5,
    '--affine-font-h6': theme.font.h6,
    '--affine-font-base': theme.font.base,
    '--affine-font-sm': theme.font.sm, // small
    '--affine-font-xs': theme.font.xs, // tiny

    '--affine-line-height': theme.font.lineHeight,

    '--affine-z-index-modal': theme.zIndex.modal,
    '--affine-z-index-popover': theme.zIndex.popover,

    '--affine-font-family': theme.font.family,
    '--affine-font-number-family': theme.font.numberFamily,
    '--affine-font-code-family': theme.font.codeFamily,

    '--affine-paragraph-space': theme.space.paragraph,
    '--affine-popover-radius': theme.radius.popover,
  };
};
