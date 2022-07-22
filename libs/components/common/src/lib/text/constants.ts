import { Protocol } from '@toeverything/datasource/db-service';
const InnerTextStyle = {
    FONT_FAMILY: 'FONT_FAMILY',
    FONT_SIZE: 'FONT_SIZE',
    COLOR: 'FOREGROUND_COLOR',
    BACKGROUND_COLOR: 'BACKGROUND_COLOR',
    BOLD: 'BOLD',
    ITALIC: 'ITALIC',
    UNDERLINE: 'UNDERLINE',
    STRIKETHROUGH: 'STRIKETHROUGH',
    VERTICAL_ALIGN: 'VERTICAL_ALIGN',
    UNDER_LINE: 'UNDER_LINE',
};
export const MARKDOWN_REGS = [
    {
        type: InnerTextStyle.BOLD,
        reg: /\*{2}.+\*{2}$/,
        start: '**',
        end: '**',
    },
    {
        type: InnerTextStyle.ITALIC,
        reg: /\*.+\*$/,
        start: '*',
        end: '*',
    },
    {
        type: InnerTextStyle.STRIKETHROUGH,
        reg: /[~～]{2}.+[~～]{2}$/,
        start: '~~',
        end: '~~',
    },
    {
        type: InnerTextStyle.UNDER_LINE,
        reg: /[~～].+[~～]$/,
        start: '~',
        end: '~',
    },
    {
        type: Protocol.Block.Type.heading3,
        reg: /^#{3}$/,
        start: '###',
    },
    {
        type: Protocol.Block.Type.heading2,
        reg: /^#{2}$/,
        start: '##',
    },
    {
        type: Protocol.Block.Type.heading1,
        reg: /^#$/,
        start: '#',
    },
    {
        type: Protocol.Block.Type.numbered,
        reg: /^1\.$/,
        start: '1.',
    },
    {
        type: Protocol.Block.Type.bullet,
        reg: /^(-|\*|\+)$/,
        start: '*',
    },
    {
        type: Protocol.Block.Type.todo,
        reg: /^(\[]|【】)$/,
        start: '[]',
    },
    {
        type: Protocol.Block.Type.code,
        reg: /^`{3}$/,
        start: '```',
    },
    // {
    //     type: Protocol.Block.Type.toc,
    //     reg: /^\[toc\]$/,
    //     start: '[t'
    // },
    {
        type: Protocol.Block.Type.quote,
        reg: /^[>》]$/,
        start: '>',
    },
    {
        type: Protocol.Block.Type.groupDivider,
        reg: /^(={3}|\*{3})$/,
        start: '===',
    },
    // divider
    {
        type: Protocol.Block.Type.divider,
        reg: /^(-{3}|\*{3})$/,
        start: '---',
    },
    // callout
    {
        type: Protocol.Block.Type.callout,
        reg: /^!-$/,
        start: '!-',
    },
    {
        type: Protocol.Block.Type.file,
        reg: /^file$/,
        start: 'file',
    },
    {
        type: Protocol.Block.Type.image,
        reg: /^img$/,
        start: 'img',
    },
    {
        type: Protocol.Block.Type.youtube,
        reg: /^youtube$/,
        start: 'youtube',
    },
    {
        type: Protocol.Block.Type.figma,
        reg: /^figma$/,
        start: 'figma',
    },
    {
        type: Protocol.Block.Type.embedLink,
        reg: /^embedLink$/,
        start: 'embedLink',
    },
];

export const HOTKEYS = {
    'mod+b': 'bold',
    'mod+i': 'italic',
    'mod+u': 'underline',
    'mod+k': 'link',
    'mod+shift+s': 'strikethrough',
    'mod+e': 'inlinecode',
} as const;

export const fontColorPalette = {
    default: 'rgb(0,0,0)',
    affineGray: 'rgb(155, 154, 151)',
    affineBrown: 'rgb(100, 71, 58)',
    affineOrange: 'rgb(217, 115, 13)',
    affineYellow: 'rgb(223, 171, 1)',
    affineGreen: 'rgb(77, 100, 97)',
    affineBlue: 'rgb(11, 110, 153)',
    affinePurple: 'rgb(105, 64, 165)',
    affinePink: 'rgb(173, 26, 114)',
    affineRed: 'rgb(224, 62, 62)',
} as const;

export const fontBgColorPalette = {
    default: 'rgb(255,255,255)',
    affineGray: 'rgb(235, 236, 237)',
    affineBrown: 'rgb(233, 229, 227)',
    affineOrange: 'rgb(250, 235, 221)',
    affineYellow: 'rgb(251, 243, 219)',
    affineGreen: 'rgb(221, 237, 234)',
    affineBlue: 'rgb(221, 235, 241)',
    affinePurple: 'rgb(234, 228, 242)',
    affinePink: 'rgb(244, 223, 235)',
    affineRed: 'rgb(251, 228, 228)',
} as const;

export const fontColorPaletteKeys = Object.keys(fontColorPalette).reduce(
    (aac, curr) => ({ [curr]: curr, ...aac }),
    {}
) as Record<keyof typeof fontColorPalette, keyof typeof fontColorPalette>;

export const fontBgColorPaletteKeys = Object.keys(fontBgColorPalette).reduce(
    (aac, curr) => ({ [curr]: curr, ...aac }),
    {}
) as Record<keyof typeof fontBgColorPalette, keyof typeof fontBgColorPalette>;

export type TextStyleMark =
    | typeof HOTKEYS[keyof typeof HOTKEYS]
    | 'fontColor'
    | 'fontBgColor';

export type TextAlignOptions =
    | 'left'
    | 'center'
    | 'right'
    | 'justify'
    | undefined;

export const interceptMarks = ['\u0020'];

export const INLINE_STYLES = [
    InnerTextStyle.BOLD,
    InnerTextStyle.STRIKETHROUGH,
    InnerTextStyle.UNDER_LINE,
    InnerTextStyle.ITALIC,
];
