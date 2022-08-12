import type { FC, PropsWithChildren, ReactNode } from 'react';
// eslint-disable-next-line no-restricted-imports
import {
    createTheme,
    ThemeProvider as MuiThemeProvider,
    useTheme as muiUseTheme,
    Theme as MuiTheme,
} from '@mui/material/styles';
import type { ThemeOptions as AffineThemeOptions } from './theme';
import { Theme } from './theme';

declare module '@mui/material/styles' {
    interface Theme {
        affine: AffineThemeOptions;
    }
    // allow configuration using `createTheme`
    interface ThemeOptions {
        affine: AffineThemeOptions;
    }
}

const theme = createTheme({
    affine: Theme,
});

export const ThemeProvider = ({ children }: { children?: ReactNode }) => {
    return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
};

export const useTheme = () => muiUseTheme();

export const withTheme = <T,>(
    Component: FC<T & { theme: MuiTheme }>
): FC<T> => {
    return props => {
        const theme = useTheme();
        return <Component {...props} theme={theme} />;
    };
};
