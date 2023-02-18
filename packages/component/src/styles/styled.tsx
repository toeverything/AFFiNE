import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import emotionStyled from '@emotion/styled';
import type { PropsWithChildren } from 'react';

import { AffineTheme } from './types';
export { css, keyframes } from '@emotion/react';
export const styled = emotionStyled;

export const ThemeProvider = ({
  theme,
  children,
}: PropsWithChildren<{
  theme: AffineTheme;
}>) => {
  return <EmotionThemeProvider theme={theme}>{children}</EmotionThemeProvider>;
};
