import {
    fontBgColorPaletteKeys,
    fontColorPaletteKeys,
} from '@toeverything/components/common';
import type { InlineMenuNamesType } from './types';
import { Protocol } from '@toeverything/datasource/db-service';

export const INLINE_MENU_UI_TYPES = {
    icon: 'Icon',
    dropdown: 'Dropdown',
    separator: 'Separator',
} as const;

/** inline menu item { key : display-name } */
export const MacInlineMenuShortcuts = {
    textBold: '⌘+B',
    textItalic: '⌘+I',
    textStrikethrough: '⌘+S',
    link: '⌘+K',
    [Protocol.Block.Type.code]: '⌘+E',
};
export const WinInlineMenuShortcuts = {
    textBold: 'Ctrl+B',
    textItalic: 'Ctrl+I',
    textStrikethrough: 'Ctrl+S',
    link: 'Ctrl+K',
    [Protocol.Block.Type.code]: 'Ctrl+E',
};
export const inlineMenuNames = {
    currentText: 'TEXT SIZE',
    [Protocol.Block.Type.heading1]: 'Heading 1',
    [Protocol.Block.Type.heading2]: 'Heading 2',
    [Protocol.Block.Type.heading3]: 'Heading 3',
    text: 'Text',
    currentList: 'CHECK BOX',
    [Protocol.Block.Type.todo]: 'To do',
    [Protocol.Block.Type.numbered]: 'Number',
    [Protocol.Block.Type.bullet]: 'Bullet',
    comment: 'Comment',
    textBold: 'Bold',
    textItalic: 'Italic',
    textStrikethrough: 'Strikethrough',
    link: 'Link',
    [Protocol.Block.Type.code]: 'Code',
    currentFontColor: 'COLOR',
    currentFontBackground: 'BACKGROUND COLOR',
    colorDefault: 'Default',
    colorGray: 'Gray',
    colorBrown: 'Brown',
    colorOrange: 'Orange',
    colorYellow: 'Yellow',
    colorGreen: 'Green',
    colorBlue: 'Blue',
    colorPurple: 'Purple',
    colorPink: 'Pink',
    colorRed: 'Red',
    bgDefault: 'Default background',
    bgGray: 'Gray background',
    bgBrown: 'Brown background',
    bgOrange: 'Orange background',
    bgYellow: 'Yellow background',
    bgGreen: 'Green background',
    bgBlue: 'Blue background',
    bgPurple: 'Purple background',
    bgPink: 'Pink background',
    bgRed: 'Red background',
    currentTextAlign: 'TEXT ALIGN',
    alignLeft: 'Align Left',
    alignCenter: 'Align Center',
    alignRight: 'Align Right',
    turnInto: 'TURN INTO',
    [Protocol.Block.Type.page]: 'Page',
    [Protocol.Block.Type.quote]: 'Quote',
    [Protocol.Block.Type.callout]: 'Callout',
    // [Protocol.Block.Type.code]: 'Code Block',
    codeBlock: 'Code Block',
    [Protocol.Block.Type.image]: 'Image',
    [Protocol.Block.Type.file]: 'File',
    backlinks: 'Backlinks',
    moreActions: 'More Actions',
} as const;

export const inlineMenuNamesKeys = Object.keys(inlineMenuNames).reduce(
    (aac, curr) => ({ [curr]: curr, ...aac }),
    {}
) as Record<InlineMenuNamesType, InlineMenuNamesType>;

export const inlineMenuNamesForFontColor = {
    colorDefault: fontColorPaletteKeys.default,
    colorGray: fontColorPaletteKeys.affineGray,
    colorBrown: fontColorPaletteKeys.affineBrown,
    colorOrange: fontColorPaletteKeys.affineOrange,
    colorYellow: fontColorPaletteKeys.affineYellow,
    colorGreen: fontColorPaletteKeys.affineGreen,
    colorBlue: fontColorPaletteKeys.affineBlue,
    colorPurple: fontColorPaletteKeys.affinePurple,
    colorPink: fontColorPaletteKeys.affinePink,
    colorRed: fontColorPaletteKeys.affineRed,
    bgDefault: fontBgColorPaletteKeys.default,
    bgGray: fontBgColorPaletteKeys.affineGray,
    bgBrown: fontBgColorPaletteKeys.affineBrown,
    bgOrange: fontBgColorPaletteKeys.affineOrange,
    bgYellow: fontBgColorPaletteKeys.affineYellow,
    bgGreen: fontBgColorPaletteKeys.affineGreen,
    bgBlue: fontBgColorPaletteKeys.affineBlue,
    bgPurple: fontBgColorPaletteKeys.affinePurple,
    bgPink: fontBgColorPaletteKeys.affinePink,
    bgRed: fontBgColorPaletteKeys.affineRed,
} as const;
