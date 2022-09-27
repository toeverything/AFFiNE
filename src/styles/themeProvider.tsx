import {
  ThemeProvider as EmotionThemeProvider,
  Global,
  css,
} from '@emotion/react';
import { createContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ThemeMode, ThemeProviderProps, ThemeProviderValue } from './types';
import { lightTheme, darkTheme, globalThemeConstant } from './theme';
import { SystemTheme, LocalStorageThemeMode } from '@/styles/utils';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',
  changeMode: () => {},
  theme: lightTheme,
});

export const ThemeProvider = ({
  defaultThemeMode = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const { current: localStorageThemeMode } = useRef(
    new LocalStorageThemeMode()
  );

  const [mode, setMode] = useState<ThemeMode>(defaultThemeMode);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  const changeMode = (themeMode: ThemeMode) => {
    setMode(themeMode);
    // Remember the theme mode which user selected for next time
    localStorageThemeMode.set(themeMode);
  };

  useEffect(() => {
    const systemTheme = new SystemTheme();

    // TODO: System theme mode and user theme mode which selected need to be prioritized
    // If user has selected a theme mode, use it
    const selectedThemeMode = localStorageThemeMode.get();
    if (selectedThemeMode) {
      defaultThemeMode !== selectedThemeMode && setMode(selectedThemeMode);
    } else {
      // If user has not selected a theme mode, use system theme
      const systemThemeMode = systemTheme.get();
      defaultThemeMode !== systemThemeMode && setMode(systemThemeMode);
    }

    // When system theme changed, change the theme mode
    systemTheme.onChange(() => {
      // TODO: There may be should be provided a way to let user choose whether to
      setMode(systemTheme.get());
    });

    return () => {
      systemTheme.dispose();
    };
  }, []);

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
