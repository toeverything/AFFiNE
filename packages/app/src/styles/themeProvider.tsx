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
import { getLightTheme, getDarkTheme, globalThemeVariables } from './theme';
import { SystemThemeHelper, localStorageThemeHelper } from './utils';
import { useEditor } from '@/components/editor-provider';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',
  changeMode: () => {},
  theme: getLightTheme('page'),
});

export const ThemeProvider = ({
  defaultTheme = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [mode, setMode] = useState<ThemeMode>('auto');
  const { mode: editorMode } = useEditor();
  const themeStyle =
    theme === 'light' ? getLightTheme(editorMode) : getDarkTheme(editorMode);
  const changeMode = (themeMode: ThemeMode) => {
    themeMode !== mode && setMode(themeMode);
    // Remember the theme mode which user selected for next time
    localStorageThemeHelper.set(themeMode);
  };

  // ===================== A temporary solution, just use system theme and not remember the user selected ====================
  useEffect(() => {
    const systemThemeHelper = new SystemThemeHelper();
    const systemTheme = systemThemeHelper.get();
    setMode(systemTheme);

    systemThemeHelper.onChange(() => {
      setMode(systemThemeHelper.get());
    });
  }, []);

  useEffect(() => {
    setTheme(mode === 'auto' ? theme : mode);
  }, [mode, setTheme, theme]);
  // =====================  ====================

  // useEffect(() => {
  //   setMode(localStorageThemeHelper.get() || 'auto');
  // }, []);
  //
  // useEffect(() => {
  //   const systemThemeHelper = new SystemThemeHelper();
  //   const selectedThemeMode = localStorageThemeHelper.get();
  //
  //   const themeMode = selectedThemeMode || mode;
  //   if (themeMode === 'auto') {
  //     setTheme(systemThemeHelper.get());
  //   } else {
  //     setTheme(themeMode);
  //   }
  //
  //   // When system theme changed, change the theme mode
  //   systemThemeHelper.onChange(() => {
  //     // TODO: There may be should be provided a way to let user choose whether to
  //     if (mode === 'auto') {
  //       setTheme(systemThemeHelper.get());
  //     }
  //   });
  //
  //   return () => {
  //     systemThemeHelper.dispose();
  //   };
  // }, [mode]);

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
