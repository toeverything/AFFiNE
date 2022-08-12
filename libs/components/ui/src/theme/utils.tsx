import type { ReactNode } from 'react';
// eslint-disable-next-line no-restricted-imports
import {
    createTheme,
    Theme as MuiTheme,
    ThemeProvider as MuiThemeProvider,
    useTheme as muiUseTheme,
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
    Component: (prop: T & { theme: MuiTheme }) => JSX.Element
): ((prop: T) => JSX.Element) => {
    return props => {
        const theme = useTheme();
        return <Component {...props} theme={theme} />;
    };
};
