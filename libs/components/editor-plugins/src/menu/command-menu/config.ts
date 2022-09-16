import {
    BulletIcon,
    CalloutIcon,
    CodeIcon,
    DividerIcon,
    EmbedIcon,
    FigmaIcon,
    FileIcon,
    HeadingOneIcon,
    HeadingThreeIcon,
    HeadingTwoIcon,
    ImageIcon,
    NumberIcon,
    QuoteIcon,
    TextIcon,
    ToDoIcon,
    YoutubeIcon,
} from '@toeverything/components/icons';
import { SvgIconProps } from '@toeverything/components/ui';
import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import { Virgo } from '@toeverything/framework/virgo';
import { without } from '@toeverything/utils';

export enum CommandMenuCategories {
    pages = 'pages',
    typesetting = 'typesetting',
    lists = 'lists',
    media = 'media',
    blocks = 'blocks',
}

type ClickItemHandler = (
    anchorNodeId: string,
    type: BlockFlavorKeys | string,
    editor: Virgo
) => void;

export type CommandMenuDataType = {
    type: BlockFlavorKeys;
    text: string;
    icon: (prop: SvgIconProps) => JSX.Element;
};

export const commonCommandMenuHandler: ClickItemHandler = async (
    anchorNodeId,
    type,
    editor
) => {
    if (anchorNodeId) {
        if (Protocol.Block.Type[type as BlockFlavorKeys]) {
            const block = await editor.commands.blockCommands.createNextBlock(
                anchorNodeId,
                type as BlockFlavorKeys
            );
            editor.selectionManager.activeNodeByNodeId(block.id);
        }
    }
};

export const menuItemsMap: {
    [k in CommandMenuCategories]: Array<CommandMenuDataType>;
} = {
    [CommandMenuCategories.pages]: [],
    [CommandMenuCategories.typesetting]: [
        {
            text: 'Text',
            type: Protocol.Block.Type.text,
            icon: TextIcon,
        },
        // the Page block should not be inserted
        // {
        //     text: 'Page',
        //     type: Protocol.Block.Type.page,
        //     icon: PagesIcon,
        // },
        {
            text: 'Heading 1',
            type: Protocol.Block.Type.heading1,
            icon: HeadingOneIcon,
        },
        {
            text: 'Heading 2',
            type: Protocol.Block.Type.heading2,
            icon: HeadingTwoIcon,
        },
        {
            text: 'Heading 3',
            type: Protocol.Block.Type.heading3,
            icon: HeadingThreeIcon,
        },
    ],
    [CommandMenuCategories.lists]: [
        {
            text: 'Todo',
            type: Protocol.Block.Type.todo,
            icon: ToDoIcon,
        },
        {
            text: 'Number',
            type: Protocol.Block.Type.numbered,
            icon: NumberIcon,
        },
        {
            text: 'Bullet',
            type: Protocol.Block.Type.bullet,
            icon: BulletIcon,
        },
    ],
    [CommandMenuCategories.media]: [
        {
            text: 'Image',
            type: Protocol.Block.Type.image,
            icon: ImageIcon,
        },
        {
            text: 'File',
            type: Protocol.Block.Type.file,
            icon: FileIcon,
        },
        {
            text: 'Embed Link',
            type: 'embedLink',
            icon: EmbedIcon,
        },
        {
            text: 'Figma',
            type: Protocol.Block.Type.figma,
            icon: FigmaIcon,
        },
        {
            text: 'Youtube',
            type: Protocol.Block.Type.youtube,
            icon: YoutubeIcon,
        },
    ],
    [CommandMenuCategories.blocks]: [
        {
            text: 'Code',
            type: Protocol.Block.Type.code,
            icon: CodeIcon,
        },
        {
            text: 'Quote',
            icon: QuoteIcon,
            type: Protocol.Block.Type.quote,
        },
        {
            text: 'Callout',
            type: Protocol.Block.Type.callout,
            icon: CalloutIcon,
        },
        {
            text: 'Divider',
            icon: DividerIcon,
            type: Protocol.Block.Type.divider,
        },
    ],
};

export const defaultCategoriesList = without(
    Object.keys(menuItemsMap),
    'pages'
) as Array<CommandMenuCategories>;

export const defaultTypeList = Object.values(menuItemsMap).reduce(
    (pre, cur) => {
        cur.forEach(info => {
            pre.push(info.type);
        });
        return pre;
    },
    [] as Array<BlockFlavorKeys>
);

export const commandMenuHandlerMap: Partial<{
    [k in BlockFlavorKeys | string]: ClickItemHandler;
}> = {
    [Protocol.Block.Type.page]: () => {},
    [Protocol.Block.Type.reference]: async (anchorNodeId, type, editor) => {
        if (anchorNodeId) {
            console.log(anchorNodeId, type, editor);
            const reflink_block =
                await editor.commands.blockCommands.createNextBlock(
                    anchorNodeId,
                    Protocol.Block.Type.reference
                );
            await reflink_block.setProperty('reference', type);
        }
    },
    [Protocol.Block.Type.image]: async (anchorNodeId, type, editor) => {
        if (anchorNodeId) {
            const image_block =
                await editor.commands.blockCommands.createNextBlock(
                    anchorNodeId,
                    Protocol.Block.Type.image
                );
            // set img block active open
            image_block.firstCreateFlag = true;
        }
    },
};
