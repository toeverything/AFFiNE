import '@emotion/react';
import { AffineTheme, ThemeMode } from './types';

export const lightTheme: AffineTheme = {
  colors: {
    primary: '#0070f3',
  },
};

export const darkTheme: AffineTheme = {
  colors: {
    primary: '#000',
  },
};

export const globalThemeConstant = (mode: ThemeMode, theme: AffineTheme) => {
  const isDark = mode === 'dark';
  return {
    '--color-primary': theme.colors.primary,
    '--page-background-color': isDark ? '#3d3c3f' : '#fff',
    '--page-text-color': isDark ? '#fff' : '#3a4c5c',

    // editor style variables
    '--affine-primary-color': isDark ? '#fff' : '#3a4c5c',
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

const editorStyleVariable = {
  '--affine-primary-color': '#3a4c5c',
  '--affine-muted-color': '#a6abb7',
  '--affine-highlight-color': '#6880ff',
  '--affine-placeholder-color': '#c7c7c7',
  '--affine-selected-color': 'rgba(104, 128, 255, 0.1)',

  '--affine-font-family':
    'Avenir Next, apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji',

  '--affine-font-family2':
    'Roboto Mono, apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji',
};

const pageStyleVariable = {
  '--page-background-color': '#fff',
  '--page-text-color': '#3a4c5c',
};
