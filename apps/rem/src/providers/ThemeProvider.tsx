import {
  AffineTheme,
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
import { GlobalStyles } from '@mui/material';
import {
  createTheme as MuiCreateTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { PropsWithChildren } from 'react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const themeAtom = atomWithStorage<ThemeMode>('affine-theme', 'auto');

export const ThemeProvider = ({
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const [theme, setTheme] = useAtom(themeAtom);
  const systemTheme = useSystemTheme();
  // fixme: use mode detect
  const editorMode = 'page';
  const themeStyle = useMemo(
    () =>
      theme === 'light' ? getLightTheme(editorMode) : getDarkTheme(editorMode),
    [theme]
  );
  const changeMode = useCallback(
    (themeMode: Theme) => {
      setTheme(themeMode);
    },
    [setTheme]
  );

  useEffect(() => {
    if (theme !== 'auto') {
      setTheme(systemTheme);
    }
  }, [setTheme, systemTheme, theme]);

  const realTheme: ThemeMode = theme === 'auto' ? systemTheme : theme;

  return (
    // Use MuiThemeProvider is just because some Transitions in Mui components need it
    <MuiThemeProvider theme={muiTheme}>
      <ThemeContext.Provider
        value={{ mode: realTheme, changeMode, theme: themeStyle }}
      >
        <ThemeInjector theme={realTheme} themeStyle={themeStyle} />
        <ComponentThemeProvider theme={themeStyle}>
          {children}
        </ComponentThemeProvider>
      </ThemeContext.Provider>
    </MuiThemeProvider>
  );
};
