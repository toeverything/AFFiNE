import ColorObject from './color';
// import { ThemeOptions } from '@mui/material/styles';
/**
 * @deprecated Please use the new {@link ThemeOptions} type.
 */
interface ThemeOptionsLegacy {
    palette: Palette;
    typography: Typography;
    shadows?: Shadows;
    border?: StringWithNone;
    spacing?: Spacing;
    shape?: Shape;
}

interface Shape {
    xsBorderRadius?: string;
    borderRadius?: string;
    smBorderRadius?: string;
    lgBorderRadius?: string;
}
interface Spacing {
    xsSpacing: string;
    smSpacing?: string;
    main?: string;
    lgSpacing?: string;
}
interface Palette {
    primary?: Action;
    success?: Action;
    info?: Action;
    error?: Action;
    warning?: Action;
    text?: Action;
}
interface Action {
    main: string;
    active?: string;
    hover?: string;
    hoverOpacity?: number;
    selected?: string;
    selectedOpacity?: number;
    disabled?: string;
    disabledOpacity?: number;
    disabledBackground?: string;
    focus?: string;
    focusOpacity?: number;
    activatedOpacity?: number;
}
interface Typography {
    fontSize?: string;
    fontFamily?: string;
    xsFontSize?: string;
    lgFontSize?: string;
    fontWeight?: number;
    xsFontWeight?: number;
    lineHeight?: string;
    lgFontWeight?: number;
    button?: Font;
    body1?: Font;
    body2?: Font;
    h1?: Font;
    h2?: Font;
    h3?: Font;
    h4?: Font;
    h5?: Font;
    page?: Font;
    quote?: Font;
    callout?: Font;
}

interface Shadows {
    none: 'none';
    shadow1: string;
}

type StringWithNone = [
    'none',
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?,
    string?
];
interface Font {
    fontSize?: string;
    lineHeight?: string;
    fontFamily?: string;
    fontWeight?: number;
}

export const Theme = {
    palette: {
        /**
         * figma: white
         */
        white: '#ffffff',
        /**
         * figma: icons
         */
        icons: '#98ACBD',
        /**
         * figma: T-menu
         */
        menu: '#4C6275',
        /** separator line color for menus and icons */
        menuSeparator: '#E0E6EB',
        /**
         * figma: hover
         */
        hover: '#F5F7F8',
        /**
         * figma: tag hover
         */
        tagHover: '#E0E6EB',
        borderColor: '#E0E6EB',
        placeholderColor: '#E0E6EB',
        /**
         * figma: brand color
         */
        primary: '#3E6FDB',
        /**
         * figma: operation failed
         */
        error: '#F1675E',
        /**
         * figma: warning color
         */
        warning: '#F1BE5E',
        /**
         * figma: operation succeeded
         */
        success: '#40DF9B',
        /**
         * figma: text
         */
        primaryText: '#3A4C5C',
        /**
         * figma: subtext color
         */
        secondaryText: '#4C6275',
        /**
         * selected
         */
        textSelected: 'rgba(152, 172, 189, 0.1)',
        /**
         * text hover
         */
        textHover: '#ECF1FB',
    },
    typography: {
        button: {
            fontSize: '16px',
        },
        body1: {
            fontSize: '16px',
            lineHeight: '22px',
        },
        h1: {
            fontSize: '28px',
            lineHeight: '40px',
        },
        h2: {
            fontSize: '24px',
            lineHeight: '34px',
        },
        h3: {
            fontSize: '20px',
            lineHeight: '28px',
        },
        h4: {
            fontSize: '16px',
            lineHeight: '22px',
        },
        page: {
            fontSize: '36px',
            lineHeight: '44px',
        },
        callout: {
            fontSize: '36px',
            lineHeight: '54px',
        },
        quote: {
            fontSize: '36px',
            lineHeight: '54px',
        },
        tooltip: {
            fontSize: '12px',
            lineHeight: '18px',
        },
        sm: {
            fontSize: '14px',
            lineHeight: '20px',
        },
        xs: {
            fontSize: '12px',
            lineHeight: '18px',
        },
        base: {
            fontSize: '16px',
            lineHeight: '22px',
        },
        articleTitle: {
            fontSize: '36px',
            lineHeight: '54px',
        },
    },
    shadows: {
        none: 'none',
        shadow1: '0px 1px 5px rgba(152, 172, 189, 0.2)',
    },
    border: ['none'],
    spacing: {
        xsSpacing: '4px',
        smSpacing: '12px',
        main: '16px',
        lgSpacing: '20px',
        iconPadding: '6px',
    },
    shape: {
        borderRadius: '10px',
        xsBorderRadius: '4px',
        smBorderRadius: '8px',
        lgBorderRadius: '20px',
    },
    zIndex: {
        header: 100,
        popover: 200,
        tooltip: 300,
        modal: 400,
        message: 500,
    },
} as const;

export type ThemeOptions = typeof Theme;
