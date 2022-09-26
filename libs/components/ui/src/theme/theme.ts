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
        fontFamily: (
            [
                '-apple-system',
                'BlinkMacSystemFont',
                'Helvetica Neue',
                'Tahoma',
                'PingFang SC',
                'Microsoft Yahei',
                'Arial',
                'Hiragino Sans GB',
                'sans-serif',
                'Apple Color Emoji',
                'Segoe UI Emoji',
                'Segoe UI Symbol',
                'Noto Color Emoji',
            ] as const
        ).join(', '),

        button: {
            fontSize: '16px',
        },
        body1: {
            fontSize: '16px',
            lineHeight: '22px',
            fontWeight: 400,
            color: '#3A4C5C',
        },
        h1: {
            fontSize: '28px',
            lineHeight: '40px',
            fontWeight: 600,
        },
        h2: {
            fontSize: '24px',
            lineHeight: '34px',
            fontWeight: 600,
        },
        h3: {
            fontSize: '20px',
            lineHeight: '28px',
            fontWeight: 600,
        },
        h4: {
            fontSize: '16px',
            lineHeight: '22px',
            fontWeight: 600,
        },
        page: {
            fontSize: '36px',
            lineHeight: '44px',
            fontWeight: 600,
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
            fontWeight: 600,
        },
    },
    shadows: {
        none: 'none',
        shadow1:
            '0px 1px 10px -6px rgba(24, 39, 75, 0.08), 0px 3px 16px -6px rgba(24, 39, 75, 0.04)',
        shadow2:
            '0px 6px 16px -8px rgba(0,0,0,0.08), 0px 9px 14px 0px rgba(0,0,0,0.05), 0px 12px 24px 16px rgba(0,0,0,0.03)',
        shadow3:
            '0px 1px 10px -6px rgb(24 39 75 / 50%), 0px 3px 16px -6px rgb(24 39 75 / 30%)',
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
