import {
  Theme,
  ThemeMode,
  ThemeProviderProps,
  ThemeProviderValue,
} from '@affine/component';
import {
  getDarkTheme,
  getLightTheme,
  globalThemeVariables,
  ThemeProvider as ComponentThemeProvider,
} from '@affine/component';
import { localStorageThemeHelper } from '@affine/component';
import { css, Global } from '@emotion/react';
import {
  createTheme as MuiCreateTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',

  changeMode: () => {},
  theme: getLightTheme('page'),
});

export const useTheme = () => useContext(ThemeContext);
const muiTheme = MuiCreateTheme();

export const ThemeProvider = ({
  defaultTheme = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [mode, setMode] = useState<ThemeMode>('auto');
  const editorMode = 'page';
  const themeStyle =
    theme === 'light' ? getLightTheme(editorMode) : getDarkTheme(editorMode);
  const changeMode = (themeMode: ThemeMode) => {
    themeMode !== mode && setMode(themeMode);
    localStorageThemeHelper.set(themeMode);
  };

  useEffect(() => {
    setTheme(mode === 'auto' ? theme : mode);
  }, [mode, setTheme, theme]);

  return (
    // Use MuiThemeProvider is just because some Transitions in Mui components need it
    <MuiThemeProvider theme={muiTheme}>
      <ThemeContext.Provider value={{ mode, changeMode, theme: themeStyle }}>
        <Global
          styles={css`
            :root {
              ${globalThemeVariables(mode, themeStyle) as any}
            }
          `}
        />
        <ComponentThemeProvider theme={themeStyle}>
          {children}
        </ComponentThemeProvider>
      </ThemeContext.Provider>
    </MuiThemeProvider>
  );
};
