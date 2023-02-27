import {
  AffineTheme,
  Theme,
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
import { GlobalStyles } from '@mui/material';
import {
  createTheme as MuiCreateTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { PropsWithChildren } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { useSystemTheme } from '../hooks/use-system-theme';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',

  changeMode: () => {},
  theme: getLightTheme('page'),
});

export const useTheme = () => useContext(ThemeContext);
const muiTheme = MuiCreateTheme();

const ThemeInjector = React.memo<{
  theme: Theme;
  themeStyle: AffineTheme;
}>(function ThemeInjector({ theme, themeStyle }) {
  return (
    <GlobalStyles
      styles={{
        ':root': globalThemeVariables(theme, themeStyle) as any,
      }}
    />
  );
});

export const ThemeProvider = ({
  defaultTheme = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const systemTheme = useSystemTheme();
  // fixme: use mode detect
  const editorMode = 'page';
  const themeStyle = useMemo(
    () =>
      theme === 'light' ? getLightTheme(editorMode) : getDarkTheme(editorMode),
    [theme]
  );
  const changeMode = useCallback((themeMode: Theme) => {
    setTheme(themeMode);
    localStorageThemeHelper.set(themeMode);
  }, []);

  // useEffect(() => {
  //   setTheme(systemTheme);
  // }, [systemTheme]);

  // todo: save user theme in localStorage

  return (
    // Use MuiThemeProvider is just because some Transitions in Mui components need it
    <MuiThemeProvider theme={muiTheme}>
      <ThemeContext.Provider
        value={{ mode: theme, changeMode, theme: themeStyle }}
      >
        <ThemeInjector theme={theme} themeStyle={themeStyle} />
        <ComponentThemeProvider theme={themeStyle}>
          {children}
        </ComponentThemeProvider>
      </ThemeContext.Provider>
    </MuiThemeProvider>
  );
};
