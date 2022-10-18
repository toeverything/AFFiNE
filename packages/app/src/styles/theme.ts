import '@emotion/react';
import { AffineTheme, ThemeMode } from './types';

export const lightTheme: AffineTheme = {
  colors: {
    primary: '#3A4C5C',
    highlight: '#7389FD',
    disabled: '#9096A5',
    background: '#fff',
    hoverBackground: '#F1F3FF',
  },
  font: {
    xs: '12px',
    sm: '16px',
    base: '18px',
  },
};

export const darkTheme: AffineTheme = {
  ...lightTheme,
  colors: {
    primary: '#fff',
    highlight: '#7389FD',
    disabled: '#9096A5',
    background: '#3d3c3f',
    hoverBackground: '#F1F3FF',
  },
};

export const globalThemeConstant = (mode: ThemeMode, theme: AffineTheme) => {
  const isDark = mode === 'dark';
  return {
    '--page-background-color': theme.colors.background,
    '--page-text-color': theme.colors.primary,

    // editor style variables
    '--affine-primary-color': theme.colors.primary,
    '--affine-muted-color': '#a6abb7',
    '--affine-highlight-color': '#6880ff',
    '--affine-placeholder-color': '#c7c7c7',
    '--affine-selected-color': 'rgba(104, 128, 255, 0.1)',

    '--affine-font-family':
      'Avenir Next, apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji',

    '--affine-font-family2':
      'Roboto Mono, apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji',
  };
};
