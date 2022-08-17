import { basicDark } from 'cm6-theme-basic-dark';
import { basicLight } from 'cm6-theme-basic-light';
import { gruvboxDark } from 'cm6-theme-gruvbox-dark';
import { gruvboxLight } from 'cm6-theme-gruvbox-light';
import { solarizedDark } from 'cm6-theme-solarized-dark';
import { solarizedLight } from 'cm6-theme-solarized-light';
import { materialDark } from 'cm6-theme-material-dark';
import { nord } from 'cm6-theme-nord';

export const DEFAULT_THEME_NAME = 'basic-light';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEFAULT_THEME_EXT = basicLight;

export const themes = [
    {
        extension: basicLight,
        text: 'Basic Light',
        name: 'basic-light',
    },
    {
        extension: basicDark,
        text: 'Basic Dark',
        name: 'basic-dark',
    },
    {
        extension: solarizedLight,
        text: 'Solarized Light',
        name: 'solarized-light',
    },
    {
        extension: solarizedDark,
        text: 'Solarized Dark',
        name: 'solarized-dark',
    },
    {
        extension: materialDark,
        text: 'Material Dark',
        name: 'material-dark',
    },
    {
        extension: nord,
        text: 'Nord',
        name: 'nord',
    },
    {
        extension: gruvboxLight,
        text: 'Gruvbox Light',
        name: 'gruvbox-light',
    },
    {
        extension: gruvboxDark,
        text: 'Gruvbox Dark',
        name: 'gruvbox-dark',
    },
];
