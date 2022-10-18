import {
  ThemeProvider as EmotionThemeProvider,
  Global,
  css,
} from '@emotion/react';
import { createContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Theme,
  ThemeMode,
  ThemeProviderProps,
  ThemeProviderValue,
} from './types';
import { lightTheme, darkTheme, globalThemeVariables } from './theme';
import { SystemThemeHelper, localStorageThemeHelper } from './utils';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',
  changeMode: () => {},
  theme: lightTheme,
});

export const ThemeProvider = ({
  defaultTheme = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [mode, setMode] = useState<ThemeMode>('auto');

  const themeStyle = theme === 'light' ? lightTheme : darkTheme;
  const changeMode = (themeMode: ThemeMode) => {
    themeMode !== mode && setMode(themeMode);
    // Remember the theme mode which user selected for next time
    localStorageThemeHelper.set(themeMode);
  };

  useEffect(() => {
    setMode(localStorageThemeHelper.get() || 'auto');
  }, []);

  useEffect(() => {
    const systemThemeHelper = new SystemThemeHelper();
    const selectedThemeMode = localStorageThemeHelper.get();

    const themeMode = selectedThemeMode || mode;
    if (themeMode === 'auto') {
      setTheme(systemThemeHelper.get());
    } else {
      setTheme(themeMode);
    }

    // When system theme changed, change the theme mode
    systemThemeHelper.onChange(() => {
      // TODO: There may be should be provided a way to let user choose whether to
      if (mode === 'auto') {
        setTheme(systemThemeHelper.get());
      }
    });

    return () => {
      systemThemeHelper.dispose();
    };
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, changeMode, theme: themeStyle }}>
      <Global
        styles={css`
          :root {
            ${globalThemeVariables(mode, themeStyle) as {}}
          }
        `}
      />
      <EmotionThemeProvider theme={themeStyle}>{children}</EmotionThemeProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
