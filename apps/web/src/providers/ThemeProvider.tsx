import {
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
import { localStorageThemeHelper, SystemThemeHelper } from '@affine/component';
import { css, Global } from '@emotion/react';
import {
  createTheme as MuiCreateTheme,
  ThemeProvider as MuiThemeProvider,
} from '@mui/material/styles';
import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import useCurrentPageMeta from '@/hooks/use-current-page-meta';

export const ThemeContext = createContext<ThemeProviderValue>({
  mode: 'light',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  changeMode: () => {},
  theme: getLightTheme('page'),
});

export const useTheme = () => useContext(ThemeContext);
const muiTheme = MuiCreateTheme();

export const ThemeProvider = ({
  defaultTheme = 'light',
  children,
}: PropsWithChildren<ThemeProviderProps>) => {
  const localStorageThemeMode = useSyncExternalStore<ThemeMode>(
    useCallback(cb => {
      localStorageThemeHelper.callback.add(cb);
      return () => {
        localStorageThemeHelper.callback.delete(cb);
      };
    }, []),
    useCallback(() => localStorageThemeHelper.get() ?? 'light', []),
    useCallback(() => defaultTheme, [defaultTheme])
  );
  const [mode, setMode] = useState<ThemeMode>(defaultTheme);
  if (localStorageThemeMode !== mode) {
    setMode(localStorageThemeMode);
  }
  const { mode: editorMode = 'page' } = useCurrentPageMeta() || {};
  const themeStyle =
    mode === 'light' ? getLightTheme(editorMode) : getDarkTheme(editorMode);
  const changeMode = useCallback(
    (themeMode: ThemeMode) => {
      themeMode !== mode && setMode(themeMode);
      // Remember the theme mode which user selected for next time
      localStorageThemeHelper.set(themeMode);
    },
    [mode]
  );

  // ===================== A temporary solution, just use system theme and not remember the user selected ====================
  useEffect(() => {
    const systemThemeHelper = new SystemThemeHelper();
    const systemTheme = systemThemeHelper.get();
    setMode(systemTheme);

    systemThemeHelper.onChange(() => {
      setMode(systemThemeHelper.get());
    });
  }, []);

  // useEffect(() => {
  //   setTheme(mode === 'auto' ? theme : mode);
  // }, [mode, setTheme, theme]);
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
    // Use MuiThemeProvider is just because some Transitions in Mui components need it
    <MuiThemeProvider theme={muiTheme}>
      <ThemeContext.Provider
        value={useMemo(
          () => ({ mode, changeMode, theme: themeStyle }),
          [changeMode, mode, themeStyle]
        )}
      >
        <Global
          styles={css`
            :root {
              ${
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                globalThemeVariables(mode, themeStyle) as any
              }
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

export default ThemeProvider;
