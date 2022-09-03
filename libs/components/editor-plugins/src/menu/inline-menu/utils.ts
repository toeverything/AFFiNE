/* eslint-disable max-lines */
import {
    fontBgColorPalette,
    fontColorPalette,
    type TextAlignOptions,
} from '@toeverything/components/common';
import {
    BacklinksIcon,
    BulletIcon,
    CalloutIcon,
    CodeBlockIcon,
    CodeIcon,
    CommentIcon,
    FileIcon,
    FormatBackgroundIcon,
    FormatBoldEmphasisIcon,
    FormatColorTextIcon,
    FormatItalicIcon,
    FormatStrikethroughIcon,
    HeadingOneIcon,
    HeadingThreeIcon,
    HeadingTwoIcon,
    ImageIcon,
    LinkIcon,
    MoreIcon,
    NumberIcon,
    PagesIcon,
    QuoteIcon,
    TextAlignCenterIcon,
    TextAlignLeftIcon,
    TextAlignRightIcon,
    TextFontIcon,
    ToDoIcon,
    TurnIntoIcon,
} from '@toeverything/components/icons';
import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import { Virgo } from '@toeverything/framework/virgo';
import {
    inlineMenuNames,
    inlineMenuNamesForFontColor,
    inlineMenuNamesKeys,
    INLINE_MENU_UI_TYPES,
} from './config';
import { ClickItemHandler, InlineMenuItem } from './types';

const convert_to_block_type = async ({
    editor,
    blockId,
    blockType,
}: {
    editor: Virgo;
    blockId: string;
    blockType: BlockFlavorKeys;
}) => {
    if (Protocol.Block.Type[blockType]) {
        await editor.commands.blockCommands.convertBlock(blockId, blockType);
    }
};
const toggle_text_format = ({
    editor,
    nodeId,
    format,
}: {
    editor: Virgo;
    nodeId: string;
    format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'inlinecode';
}) => {
    editor.blockHelper.toggleTextFormatBySelection(nodeId, format);
};
const add_link = ({ editor, blockId }: { editor: Virgo; blockId: string }) => {
    editor.blockHelper.setLinkModalVisible(blockId, true);
};
const set_paragraph_align = ({
    editor,
    nodeId,
    align,
}: {
    editor: Virgo;
    nodeId: string;
    align: TextAlignOptions;
}) => {
    editor.blockHelper.setParagraphAlign(nodeId, align);
};
const set_font_color = ({
    editor,
    nodeId,
    color,
}: {
    editor: Virgo;
    nodeId: string;
    color: keyof typeof fontColorPalette;
}) => {
    editor.blockHelper.setTextFontColor(nodeId, color);
};
const set_font_bg_color = ({
    editor,
    nodeId,
    bgColor,
}: {
    editor: Virgo;
    nodeId: string;
    bgColor: keyof typeof fontBgColorPalette;
}) => {
    editor.blockHelper.setTextFontBgColor(nodeId, bgColor);
};
const common_handler_for_inline_menu: ClickItemHandler = ({
    editor,
    anchorNodeId,
    type,
    setShow,
}) => {
    switch (type) {
        case inlineMenuNamesKeys.text:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.text,
            });
            break;
        case inlineMenuNamesKeys.heading1:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.heading1,
            });
            break;
        case inlineMenuNamesKeys.heading2:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.heading2,
            });
            break;
        case inlineMenuNamesKeys.heading3:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.heading3,
            });
            break;
        case inlineMenuNamesKeys.bullet:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.bullet,
            });
            break;
        case inlineMenuNamesKeys.todo:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.todo,
            });
            break;
        case inlineMenuNamesKeys.numbered:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.numbered,
            });
            break;
        case inlineMenuNamesKeys.textBold:
            toggle_text_format({
                editor,
                nodeId: anchorNodeId,
                format: 'bold',
            });
            break;
        case inlineMenuNamesKeys.textItalic:
            toggle_text_format({
                editor,
                nodeId: anchorNodeId,
                format: 'italic',
            });
            break;
        case inlineMenuNamesKeys.textStrikethrough:
            toggle_text_format({
                editor,
                nodeId: anchorNodeId,
                format: 'strikethrough',
            });
            break;
        case inlineMenuNamesKeys.link:
            // add_link({
            //     editor,
            //     blockId: anchorNodeId,
            // });
            editor.plugins.emit('showAddLink');
            setShow(false);
            break;
        case inlineMenuNamesKeys.code:
            toggle_text_format({
                editor,
                nodeId: anchorNodeId,
                format: 'inlinecode',
            });
            break;
        case inlineMenuNamesKeys.alignLeft:
            set_paragraph_align({
                editor,
                nodeId: anchorNodeId,
                align: undefined,
            });
            break;
        case inlineMenuNamesKeys.alignCenter:
            set_paragraph_align({
                editor,
                nodeId: anchorNodeId,
                align: 'center',
            });
            break;
        case inlineMenuNamesKeys.alignRight:
            set_paragraph_align({
                editor,
                nodeId: anchorNodeId,
                align: 'right',
            });
            break;
        case inlineMenuNamesKeys.colorDefault:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorDefault as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorGray:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorGray as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorBrown:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorBrown as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorOrange:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorOrange as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorYellow:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorYellow as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorGreen:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorGreen as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorBlue:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorBlue as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorPurple:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorPurple as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorPink:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorPink as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.colorRed:
            set_font_color({
                editor,
                nodeId: anchorNodeId,
                color: inlineMenuNamesForFontColor[
                    inlineMenuNamesKeys.colorRed as keyof typeof inlineMenuNamesForFontColor
                ],
            });
            break;
        case inlineMenuNamesKeys.bgDefault:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgDefault as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgGray:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgGray as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgBrown:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgBrown as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgOrange:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgOrange as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgYellow:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgYellow as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgGreen:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgGreen as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgBlue:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgBlue as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgPurple:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgPurple as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgPink:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgPink as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.bgRed:
            set_font_bg_color({
                editor,
                nodeId: anchorNodeId,
                bgColor:
                    inlineMenuNamesForFontColor[
                        inlineMenuNamesKeys.bgRed as keyof typeof inlineMenuNamesForFontColor
                    ],
            });
            break;
        case inlineMenuNamesKeys.quote:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.quote,
            });
            break;
        case inlineMenuNamesKeys.callout:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.callout,
            });
            break;
        case inlineMenuNamesKeys.codeBlock:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.code,
            });
            break;
        case inlineMenuNamesKeys.image:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.image,
            });
            break;
        case inlineMenuNamesKeys.file:
            convert_to_block_type({
                editor,
                blockId: anchorNodeId,
                blockType: Protocol.Block.Type.file,
            });
            break;
        case inlineMenuNamesKeys.backlinks:
            editor.plugins.emit('showDoubleLink');
            setShow(false);
            break;
        default: // do nothing
    }
};

type InlineMenuDataConfigType = {
    enableCommentFeature: boolean;
};

export const getInlineMenuData = ({
    enableCommentFeature,
}: InlineMenuDataConfigType): InlineMenuItem[] => {
    const inlineMenuData = [
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: HeadingOneIcon,
            name: inlineMenuNames.currentText,
            nameKey: inlineMenuNamesKeys.currentText,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: HeadingOneIcon,
                    name: inlineMenuNames.heading1,
                    nameKey: inlineMenuNamesKeys.heading1,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: HeadingTwoIcon,
                    name: inlineMenuNames.heading2,
                    nameKey: inlineMenuNamesKeys.heading2,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: HeadingThreeIcon,
                    name: inlineMenuNames.heading3,
                    nameKey: inlineMenuNamesKeys.heading3,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: TextFontIcon,
                    name: inlineMenuNames.text,
                    nameKey: inlineMenuNamesKeys.text,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: ToDoIcon,
            name: inlineMenuNames.currentList,
            nameKey: inlineMenuNamesKeys.currentList,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: ToDoIcon,
                    name: inlineMenuNames.todo,
                    nameKey: inlineMenuNamesKeys.todo,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: NumberIcon,
                    name: inlineMenuNames.numbered,
                    nameKey: inlineMenuNamesKeys.numbered,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: BulletIcon,
                    name: inlineMenuNames.bullet,
                    nameKey: inlineMenuNamesKeys.bullet,
                    active: false,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.separator,
            name: 'separator ' + inlineMenuNames.currentList,
        },
        enableCommentFeature
            ? {
                  type: INLINE_MENU_UI_TYPES.icon,
                  icon: CommentIcon,
                  name: inlineMenuNames.comment,
                  nameKey: inlineMenuNamesKeys.comment,
                  onClick: common_handler_for_inline_menu,
              }
            : null,
        enableCommentFeature
            ? {
                  type: INLINE_MENU_UI_TYPES.separator,
                  name: 'separator ' + inlineMenuNames.comment,
              }
            : null,
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: FormatBoldEmphasisIcon,
            name: inlineMenuNames.textBold,
            nameKey: inlineMenuNamesKeys.textBold,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: FormatItalicIcon,
            name: inlineMenuNames.textItalic,
            nameKey: inlineMenuNamesKeys.textItalic,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: FormatStrikethroughIcon,
            name: inlineMenuNames.textStrikethrough,
            nameKey: inlineMenuNamesKeys.textStrikethrough,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: LinkIcon,
            name: inlineMenuNames.link,
            nameKey: inlineMenuNamesKeys.link,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: CodeIcon,
            name: inlineMenuNames.code,
            nameKey: inlineMenuNamesKeys.code,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.separator,
            name: 'separator ' + inlineMenuNames.code,
        },
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: FormatColorTextIcon,
            name: inlineMenuNames.currentFontColor,
            nameKey: inlineMenuNamesKeys.currentFontColor,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorDefault,
                    nameKey: inlineMenuNamesKeys.colorDefault,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorGray,
                    nameKey: inlineMenuNamesKeys.colorGray,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorBrown,
                    nameKey: inlineMenuNamesKeys.colorBrown,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorOrange,
                    nameKey: inlineMenuNamesKeys.colorOrange,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorYellow,
                    nameKey: inlineMenuNamesKeys.colorYellow,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorGreen,
                    nameKey: inlineMenuNamesKeys.colorGreen,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorBlue,
                    nameKey: inlineMenuNamesKeys.colorBlue,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorPurple,
                    nameKey: inlineMenuNamesKeys.colorPurple,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorPink,
                    nameKey: inlineMenuNamesKeys.colorPink,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatColorTextIcon,
                    name: inlineMenuNames.colorRed,
                    nameKey: inlineMenuNamesKeys.colorRed,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: FormatBackgroundIcon,
            name: inlineMenuNames.currentFontBackground,
            nameKey: inlineMenuNamesKeys.currentFontBackground,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgDefault,
                    nameKey: inlineMenuNamesKeys.bgDefault,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgGray,
                    nameKey: inlineMenuNamesKeys.bgGray,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgBrown,
                    nameKey: inlineMenuNamesKeys.bgBrown,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgOrange,
                    nameKey: inlineMenuNamesKeys.bgOrange,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgYellow,
                    nameKey: inlineMenuNamesKeys.bgYellow,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgGreen,
                    nameKey: inlineMenuNamesKeys.bgGreen,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgBlue,
                    nameKey: inlineMenuNamesKeys.bgBlue,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgPurple,
                    nameKey: inlineMenuNamesKeys.bgPurple,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgPink,
                    nameKey: inlineMenuNamesKeys.bgPink,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FormatBackgroundIcon,
                    name: inlineMenuNames.bgRed,
                    nameKey: inlineMenuNamesKeys.bgRed,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: TextAlignLeftIcon,
            name: inlineMenuNames.currentTextAlign,
            nameKey: inlineMenuNamesKeys.currentTextAlign,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: TextAlignLeftIcon,
                    name: inlineMenuNames.alignLeft,
                    nameKey: inlineMenuNamesKeys.alignLeft,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: TextAlignCenterIcon,
                    name: inlineMenuNames.alignCenter,
                    nameKey: inlineMenuNamesKeys.alignCenter,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: TextAlignRightIcon,
                    name: inlineMenuNames.alignRight,
                    nameKey: inlineMenuNamesKeys.alignRight,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.separator,
            name: 'separator ' + inlineMenuNames.alignRight,
        },
        {
            type: INLINE_MENU_UI_TYPES.dropdown,
            icon: TurnIntoIcon,
            name: inlineMenuNames.turnInto,
            nameKey: inlineMenuNamesKeys.turnInto,
            children: [
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: PagesIcon,
                    name: inlineMenuNames.page,
                    nameKey: inlineMenuNamesKeys.page,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: QuoteIcon,
                    name: inlineMenuNames.quote,
                    nameKey: inlineMenuNamesKeys.quote,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: CalloutIcon,
                    name: inlineMenuNames.callout,
                    nameKey: inlineMenuNamesKeys.callout,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: CodeBlockIcon,
                    name: inlineMenuNames.codeBlock,
                    nameKey: inlineMenuNamesKeys.codeBlock,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: ImageIcon,
                    name: inlineMenuNames.image,
                    nameKey: inlineMenuNamesKeys.image,
                    onClick: common_handler_for_inline_menu,
                },
                {
                    type: INLINE_MENU_UI_TYPES.icon,
                    icon: FileIcon,
                    name: inlineMenuNames.file,
                    nameKey: inlineMenuNamesKeys.file,
                    onClick: common_handler_for_inline_menu,
                },
            ],
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: BacklinksIcon,
            name: inlineMenuNames.backlinks,
            nameKey: inlineMenuNamesKeys.backlinks,
            onClick: common_handler_for_inline_menu,
        },
        {
            type: INLINE_MENU_UI_TYPES.icon,
            icon: MoreIcon,
            name: inlineMenuNames.moreActions,
            nameKey: inlineMenuNamesKeys.moreActions,
            onClick: common_handler_for_inline_menu,
        },
    ];

    return inlineMenuData.filter(item => Boolean(item));
};
