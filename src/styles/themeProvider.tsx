import {
  ThemeProvider as EmotionThemeProvider,
  Global,
  css,
} from '@emotion/react';
import { createContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ThemeMode, ThemeProviderProps, ThemeProviderValue } from './types';
import { lightTheme, darkTheme, globalThemeConstant } from './theme';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',
  changeMode: () => {},
  theme: lightTheme,
});

export const ThemeProvider = ({
  defaultMode = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);
  const theme = mode === 'dark' ? darkTheme : lightTheme;
  const changeMode = (themeMode: ThemeMode) => {
    setMode(themeMode);
  };

  return (
    <ThemeContext.Provider value={{ mode, changeMode, theme }}>
      <Global
        styles={css`
          :root {
            ${globalThemeConstant(theme)}
          }
        `}
      />
      <EmotionThemeProvider theme={theme}>{children}</EmotionThemeProvider>
    </ThemeContext.Provider>
  );
};
