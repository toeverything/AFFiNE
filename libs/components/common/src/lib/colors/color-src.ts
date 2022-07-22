import tinycolor from 'tinycolor2';

// return rgba based on hex & transparency
const rgbaString = (hex: string, alpha: number) => {
    const color = tinycolor(hex);
    return color.setAlpha(alpha).toString();
};

// base color, non-semantic
export const colorBase = {
    // light theme
    light: {
        // gray
        Gray01: '#000000',
        Gray02: '#333333',
        Gray03: '#666666',
        Gray04: '#999999',
        Gray05: '#cccccc',
        Gray06: '#e1e1e1',
        Gray07: '#eaeaea',
        Gray08: '#F5F5F5',
        Gray09: '#FBFAFA',
        Gray10: '#FFFFFF',

        // gray-vc
        GrayVc07: '#e8eaed',
        GrayVc09: '#787b80',

        // blue
        Blue01: '#1851b3',
        Blue02: '#0050db',
        Blue03: '#0c63fa',
        Blue04: '#337eff',
        Blue05: '#80aeff',
        Blue06: '#a5c4fe',
        Blue07: '#bbd2fe',
        Blue08: '#d0e0fe',
        Blue09: '#edf3ff',
        Blue10: '#f5f8ff',
        // blue-vc
        BlueVc09: '#e0ebff',

        // cyan
        Cyan01: '#0190D8',
        Cyan02: '#58BFF3',
        Cyan03: '#88D2F5',
        Cyan04: '#B7E3F9',
        Cyan05: '#D0EEFD',
        Cyan06: '#E7F6FC',

        // green
        Green01: '#017547',
        Green02: '#018550',
        Green03: '#03a363',
        Green04: '#06cc7d',
        Green05: '#0ccf81',
        Green06: '#31e097',
        Green07: '#75ebbc',
        Green08: '#b6f0d9',
        Green09: '#d3f6e8',
        Green10: '#e8faf3',
        Green11: '#f2fcf8',

        // grass-green
        GrassGreen01: '#02661b',
        GrassGreen02: '#038523',
        GrassGreen03: '#02a32a',
        GrassGreen04: '#06bf34',
        GrassGreen05: '#2fd656',
        GrassGreen06: '#50de71',
        GrassGreen07: '#7ceb96',
        GrassGreen08: '#b4f0c2',
        GrassGreen09: '#d2f6da',
        GrassGreen10: '#e8faec',
        GrassGreen11: '#f2fcf5',

        // orange
        Orange01: '#fca10d',
        Orange02: '#fff0e0',

        // orange-vc
        OrangeVc04: '#fc7f00',

        // orange-calendar
        OrangeCalendar01: '#944b01',
        OrangeCalendar02: '#ba5f04',
        OrangeCalendar03: '#d9730d',
        OrangeCalendar04: '#fc860f',
        OrangeCalendar05: '#fc9c42',
        OrangeCalendar06: '#fcad62',
        OrangeCalendar07: '#fcbf86',
        OrangeCalendar08: '#fcdcbd',
        OrangeCalendar09: '#faf1e8',
        OrangeCalendar10: '#fcf7f2',

        // yellow
        Yellow01: '#fcc036',
        Yellow02: '#fcca26',
        Yellow03: '#fff7e0',

        // yellow-calendar
        YellowCalendar01: '#6b4f01',
        YellowCalendar02: '#9c7202',
        YellowCalendar03: '#c7950a',
        YellowCalendar04: '#fabc11',
        YellowCalendar05: '#fac641',
        YellowCalendar06: '#fad26b',
        YellowCalendar07: '#fce19a',
        YellowCalendar08: '#fcedc7',
        YellowCalendar09: '#faf5e8',
        YellowCalendar10: '#fcfaf2',

        // red
        Red01: '#9e0202',
        Red02: '#b50707',
        Red03: '#db1d1d',
        Red04: '#fc3232',
        Red05: '#fc5656',
        Red06: '#fc8b8b',
        Red07: '#fcb3b3',
        Red08: '#fcd9da',
        Red09: '#fae8e9',
        Red10: '#fff5f5',

        // red-vc
        RedVc09: '#ffebec',

        // carmine
        Carmine01: '#9e025a',
        Carmine02: '#ba076d',
        Carmine03: '#d90d81',
        Carmine04: '#f72d9f',
        Carmine05: '#fa46af',
        Carmine06: '#fc74c4',
        Carmine07: '#fca9da',
        Carmine08: '#fccce8',
        Carmine09: '#fae8f3',
        Carmine10: '#fcf2f8',

        // purple
        Purple01: '#502EC4',
        Purple02: '#A086FA',
        Purple03: '#BBA9FB',
        Purple04: '#BBA9FB',
        Purple05: '#E5DDFD',
        Purple06: '#F1ECFE',

        // brown
        Brown01: '#8a2608',
        Brown02: '#9c3313',
        Brown03: '#b04828',
        Brown04: '#b86044',
        Brown05: '#db7d60',
        Brown06: '#ed9277',
        Brown07: '#f5ad98',
        Brown08: '#fcd6ca',
        Brown09: '#faece8',
        Brown10: '#fcf5f2',

        // gray-blue
        GrayBlue01: '#3d5c80',
        GrayBlue02: '#476c96',
        GrayBlue03: '#587fad',
        GrayBlue04: '#658fbf',
        GrayBlue05: '#7ca2cf',
        GrayBlue06: '#94b9e3',
        GrayBlue07: '#abc9eb',
        GrayBlue08: '#c8def7',
        GrayBlue09: '#EDF5FF',
        GrayBlue10: '#F2F7FC',

        // docs new colors:
        // Red - Docs Red
        DocsRed01: '#7E0101',
        // Orange - Docs Orange
        DocsOrange01: '#7A3D00',
        // Lemon Yellow - Docs Lemon
        DocsLemon01: '#6B4C00',
        DocsLemon03: '#B38F00',
        DocsLemon05: '#FCE303',
        DocsLemon06: '#FCEE4C',
        DocsLemon08: '#FFF88F',
        DocsLemon09: '#FFFABA',
        // Green - Docs Green
        DocsGreen01: '#285215',
        DocsGreen03: '#4C8A29',
        DocsGreen05: '#71B842',
        DocsGreen06: '#91CC66',
        DocsGreen08: '#BDE9A5',
        DocsGreen09: '#E2FAD4',
        // sky blue - Docs Sky
        DocsSky01: '#004587',
        DocsSky03: '#016DCB',
        DocsSky05: '#0C87FA',
        DocsSky06: '#37ACFF',
        DocsSky08: '#86D9FF',
        DocsSky09: '#D1F2FF',
        // Gray Blue - Docs Gray Blue
        DocsGrayBlue01: '#30445C',
        DocsGrayBlue09: '#DEECFC',
        // Purple - Docs Purple
        DocsPurple01: '#360990',
        // Magenta - Docs Carmine
        DocsCarmine01: '#88014E',
        // Gray - Docs Gray
        DocsGray10: '#3B3F44',
        DocsGray11: '#2C2F33',
    },
    // dark theme
    dark: {
        // gray
        Gray01: '#17181A',
        Gray02: '#121314',
        Gray03: '#101112',
        Gray04: '#27292b',
        Gray05: '#2d2f32',
        Gray06: '#303134',
        Gray07: '#45474a',
        Gray08: '#515155',
        Gray09: '#65676a',
        Gray10: '#88898C',
        Gray12: '#f7f7f7',
        Gray13: '#fafafa',
        // gray-vc
        GrayVc07: '#e3e5e8',
        GrayVc09: '#88898c',

        // blue
        Blue01: '#134BE0',
        Blue02: '#1E6FFF',
        Blue03: '#5D98FF',
        Blue04: '#98BEFF',
        Blue05: '#C2D8FF',
        Blue06: '#EDF3FF',
        Blue07: '#EDF3FF',
        Blue08: '#EDF3FF',
        Blue09: '#EDF3FF',
        // blue-vc
        BlueVc09: '#1A2741',

        // cyan
        Cyan01: '#046B7A',
        Cyan02: '#058599',
        Cyan03: '#049dbf',
        Cyan04: '#0AB7D1',
        Cyan05: '#2DCEE3',
        Cyan06: '#52E0F2',
        Cyan07: '#45B3C4',
        Cyan08: '#368A96',
        Cyan09: '#275F69',
        Cyan10: '#17363c',
        Cyan11: '#0F2226',

        // green
        Green01: '#68BB0B',
        Green02: '#A3E163',
        Green03: '#BDE98F',
        Green04: '#D8F0BD',
        Green05: '#E6F7D3',
        Green06: '#F2FCE9',

        // grass-green
        GrassGreen01: '#046B1E',
        GrassGreen02: '#068C27',
        GrassGreen03: '#00942c',
        GrassGreen04: '#09BA36',
        GrassGreen05: '#33CC57',
        GrassGreen06: '#52D972',
        GrassGreen07: '#3EA356',
        GrassGreen08: '#2B703B',
        GrassGreen09: '#1D4D2A',
        GrassGreen10: '#163820',
        GrassGreen11: '#112918',

        // orange
        Orange01: '#E96800',
        Orange02: '#FEA94B',
        Orange03: '#FDC17F',
        Orange04: '#FFDAB2',
        Orange05: '#FFE7CD',
        Orange06: '#FFF1E3',

        // orange-vc
        OrangeVc04: '#fc850d',

        // orange-calendar
        OrangeCalendar01: '#99530C',
        OrangeCalendar02: '#BD660F',
        OrangeCalendar03: '#DA7918',
        OrangeCalendar04: '#e0760b',
        OrangeCalendar05: '#B86818',
        OrangeCalendar06: '#8F561E',
        OrangeCalendar07: '#66411E',
        OrangeCalendar08: '#3D2917',
        OrangeCalendar09: '#3d2a17',
        OrangeCalendar10: '#261C12',

        // yellow
        Yellow01: '#F59800',
        Yellow02: '#FFDA4E',
        Yellow03: '#FFE480',
        Yellow04: '#FFF0B3',
        Yellow05: '#FFF4CD',
        Yellow06: '#FFF9E7',

        // yellow-calendar
        YellowCalendar01: '#705302',
        YellowCalendar02: '#A17705',
        YellowCalendar03: '#d19704',
        YellowCalendar04: '#b88702',
        YellowCalendar05: '#FCC947',
        YellowCalendar06: '#BD983A',
        YellowCalendar07: '#7D662A',
        YellowCalendar08: '#54451E',
        YellowCalendar09: '#3d3417',
        YellowCalendar10: '#26200E',

        // red
        Red01: '#9e0505',
        Red02: '#b50b0b',
        Red03: '#db272d',
        Red04: '#fc3c3c',
        Red05: '#fc5e5e',
        Red06: '#7a2525',
        Red07: '#632122',
        Red08: '#4c1d1d',
        Red09: '#421d1e',
        Red10: '#2e1c1c',

        // red-vc
        RedVc09: '#ffebec',

        // carmine
        Carmine01: '#A3055F',
        Carmine02: '#BF0B71',
        Carmine03: '#DE1285',
        Carmine04: '#e32998',
        Carmine05: '#FC4CB3',
        Carmine06: '#CF4294',
        Carmine07: '#A13774',
        Carmine08: '#702A53',
        Carmine09: '#401a31',
        Carmine10: '#26101E',

        // purple
        Purple01: '#480FBA',
        Purple02: '#6021DE',
        Purple03: '#7E3DFF',
        Purple04: '#8c56ff',
        Purple05: '#9d6dfc',
        Purple06: '#b797fc',
        Purple07: '#977BD1',
        Purple08: '#7660A6',
        Purple09: '#342a4a',
        Purple10: '#1B1526',

        // brown
        Brown01: '#8F2A0B',
        Brown02: '#9E3616',
        Brown03: '#b85944',
        Brown04: '#BA6449',
        Brown05: '#DB8165',
        Brown06: '#B5705B',
        Brown07: '#8F5E4F',
        Brown08: '#69483F',
        Brown09: '#3B2A26',
        Brown10: '#261D1A',

        // gray-blue
        GrayBlue01: '#81868c',
        GrayBlue02: '#50739B',
        GrayBlue03: '#5F85B3',
        GrayBlue04: '#4F81C7',
        GrayBlue05: '#496280',
        GrayBlue06: '#3F5269',
        GrayBlue07: '#334152',
        GrayBlue08: '#27303B',
        GrayBlue09: '#28303b',
        GrayBlue10: '#252C36',

        // docs new colors:
        // Red - Docs Red
        DocsRed01: '#7E0101',
        // Orange - Docs Orange
        DocsOrange01: '#7A3D00',
        // Lemon Yellow - Docs Lemon
        DocsLemon01: '#6B4C00',
        DocsLemon03: '#B38F00',
        DocsLemon05: '#FCE303',
        DocsLemon06: '#FCEE4C',
        DocsLemon08: '#FFF88F',
        DocsLemon09: '#FFFABA',
        // Green - Docs Green
        DocsGreen01: '#285215',
        DocsGreen03: '#4C8A29',
        DocsGreen05: '#71B842',
        DocsGreen06: '#91CC66',
        DocsGreen08: '#BDE9A5',
        DocsGreen09: '#E2FAD4',
        // sky blue - Docs Sky
        DocsSky01: '#004587',
        DocsSky03: '#016DCB',
        DocsSky05: '#1889F2',
        DocsSky06: '#329BE6',
        DocsSky08: '#86D9FF',
        DocsSky09: '#D1F2FF',
        // Gray Blue - Docs Gray Blue
        DocsGrayBlue01: '#30445C',
        DocsGrayBlue09: '#DEECFC',
        // Purple - Docs Purple
        DocsPurple01: '#360990',
        // Magenta - Docs Carmine
        DocsCarmine01: '#88014E',
        // Gray - Docs Gray
        DocsGray10: '#3B3F44',
        DocsGray11: '#2C2F33',
    },
};

// scene color, semantic
export const colorScenes = {
    light: {
        // main color (@Blue03)
        PrimaryColor: colorBase.light.Blue03,
        CardBg: colorBase.light.Gray01, // Card background color
        CardNestedBg: colorBase.light.Gray02, // Background color of the nested area in the card
        // primary button - primary
        ButtonPrimaryBg: colorBase.light.Blue03, // primary button background color
        ButtonPrimaryText: colorBase.light.Gray01, // primary button text color
        ButtonPrimaryBgHover: colorBase.light.Blue04, // background color - hover
        ButtonPrimaryTextHover: colorBase.light.Gray01, // Text color - hover
        ButtonPrimaryBgActive: colorBase.light.Blue02, // background color - active
        ButtonPrimaryTextActive: colorBase.light.Gray01, // Text color - active
        ButtonPrimaryBgDisabled: colorBase.light.Blue05, // background color - disabled
        ButtonPrimaryTextDisabled: colorBase.light.Gray01, // Text color - disabled
        // secondary button - secondary
        ButtonSecondaryBg: colorBase.light.Gray01, // secondary button background color
        ButtonSecondaryText: colorBase.light.Gray03, // Secondary button text color
        ButtonSecondaryBgHover: colorBase.light.Gray02, // background color - hover
        ButtonSecondaryTextHover: colorBase.light.Gray03, // Text color - hover
        ButtonSecondaryBgActive: colorBase.light.Gray03, // background color - active
        ButtonSecondaryTextActive: colorBase.light.Gray03, // Text color - active
        ButtonSecondaryBgDisabled: colorBase.light.Gray03, // background color - disabled
        ButtonSecondaryTextDisabled: colorBase.light.Gray09, // Text color - disabled
        // ghost button - ghost
        ButtonGhostBg: colorBase.light.Gray01, // Ghost button background color
        ButtonGhostText: colorBase.light.Blue03, // Ghost button text color
        ButtonGhostBgHover: colorBase.light.Blue09, // background color - hover
        ButtonGhostTextHover: colorBase.light.Blue03, // Text color - hover
        ButtonGhostBgActive: colorBase.light.Blue08, // background color - active
        ButtonGhostTextActive: colorBase.light.Blue03, // Text color - active
        ButtonGhostBgDisabled: colorBase.light.Gray03, // background color - disabled
        ButtonGhostTextDisabled: colorBase.light.Gray09, // text color - disabled

        ContainerBorder: rgbaString(colorBase.light.Gray03, 0.12), // item hover // container border
        DividerColor: rgbaString(colorBase.light.Gray03, 0.08), // global divider
        SelectColor: rgbaString(colorBase.light.GrayBlue01, 0.08), // item select
        HoverColor: rgbaString(colorBase.light.GrayBlue01, 0.05), // item hover
        ModalMaskBg: rgbaString(colorBase.light.Gray03, 0.45), // modal translucent mask
        CardBoxShadow: rgbaString(colorBase.light.Gray03, 0.04), // card shadow
        TooltipBg: colorBase.light.Gray03, // tooltip background color
        TooltipText: colorBase.light.Gray01, // tooltip text color
    },
    dark: {
        // main color (@Blue03)
        PrimaryColor: colorBase.dark.Blue03,
        CardBg: colorBase.dark.Gray04,
        CardNestedBg: colorBase.dark.Gray06,
        // main button
        ButtonPrimaryBg: colorBase.dark.Blue03,
        ButtonPrimaryText: colorBase.dark.Gray03,
        ButtonPrimaryBgHover: colorBase.dark.Blue04, // background color - hover
        ButtonPrimaryTextHover: colorBase.dark.Gray03, // Text color - hover
        ButtonPrimaryBgActive: colorBase.dark.Blue02, // background color - active
        ButtonPrimaryTextActive: colorBase.dark.Gray03, // Text color - active
        ButtonPrimaryBgDisabled: colorBase.dark.Blue05, // background color - disabled
        ButtonPrimaryTextDisabled: colorBase.dark.Gray03, // Text color - disabled
        // The dark mode secondary button has the same style as the ghost button
        // secondary button
        ButtonSecondaryBg: rgbaString(colorBase.dark.Gray03, 0.1),
        ButtonSecondaryText: colorBase.dark.Gray03,
        ButtonSecondaryBgHover: rgbaString(colorBase.dark.Gray03, 0.15), // background color - hover
        ButtonSecondaryTextHover: colorBase.dark.Gray03, // Text color - hover
        ButtonSecondaryBgActive: rgbaString(colorBase.dark.Gray03, 0.07), // background color - active
        ButtonSecondaryTextActive: colorBase.dark.Gray03, // Text color - active
        ButtonSecondaryBgDisabled: rgbaString(colorBase.dark.Gray03, 0.07), // background color - disabled
        ButtonSecondaryTextDisabled: colorBase.dark.Gray09, // Text color - disabled
        // ghost button
        ButtonGhostBg: rgbaString(colorBase.dark.Gray03, 0.1),
        ButtonGhostText: colorBase.dark.Gray03,
        ButtonGhostBgHover: rgbaString(colorBase.dark.Gray03, 0.15), // background color - hover
        ButtonGhostTextHover: colorBase.dark.Gray03, // Text color - hover
        ButtonGhostBgActive: rgbaString(colorBase.dark.Gray03, 0.07), // background color - active
        ButtonGhostTextActive: colorBase.dark.Gray03, // Text color - active
        ButtonGhostBgDisabled: rgbaString(colorBase.dark.Gray03, 0.07), // background color - disabled
        ButtonGhostTextDisabled: colorBase.dark.Gray09, // Text color - disabled
        ContainerBorder: rgbaString(colorBase.dark.Gray03, 0.12),
        DividerColor: rgbaString(colorBase.dark.Gray03, 0.08),
        SelectColor: rgbaString(colorBase.dark.GrayBlue01, 0.2),
        HoverColor: rgbaString(colorBase.dark.GrayBlue01, 0.1),
        ModalMaskBg: rgbaString(colorBase.light.Gray03, 0.5),
        CardBoxShadow: rgbaString(colorBase.light.Gray03, 0.3),
        TooltipBg: colorBase.dark.Gray05,
        TooltipText: colorBase.dark.Gray03,
    },
};

export default {
    light: {
        ...colorBase.light,
        ...colorScenes.light,
    },
    dark: {
        ...colorBase.dark,
        ...colorScenes.dark,
    },
};
