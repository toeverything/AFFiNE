import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import ShortTextIcon from '@mui/icons-material/ShortText';
import TitleIcon from '@mui/icons-material/Title';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import {
    CodeBlockInlineIcon,
    PagesIcon,
} from '@toeverything/components/common';
import ListIcon from '@mui/icons-material/List';
export const MENU_WIDTH = 14;
export const pageConvertIconSize = 24;
type MenuItem = {
    name: string[];
    title: string;
    blockType: string;
    render?({ renderNode }: { renderNode: any }): void;
    icon: typeof ShortTextIcon;
    params?: Record<string, any>;
    disable?: boolean;
};

const textTypeBlocks: MenuItem[] = [
    {
        name: ['text'], // name represents the search keyword
        title: 'Text',
        blockType: Protocol.Block.Type.text,
        icon: ShortTextIcon,
    },
    {
        name: ['quote'],
        title: 'Quote',
        blockType: Protocol.Block.Type.quote,
        icon: ShortTextIcon,
    },
    {
        name: ['page'],
        title: 'Page',
        blockType: Protocol.Block.Type.page,
        icon: PagesIcon as any,
    },
    {
        name: ['todo'],
        title: 'To-do list',
        blockType: Protocol.Block.Type.todo,
        icon: ListIcon,
    },
    {
        name: ['heading1'],
        title: 'Heading 1',
        blockType: Protocol.Block.Type.heading1,
        icon: TitleIcon,
    },
    {
        name: ['heading2'],
        title: 'Heading 2',
        blockType: Protocol.Block.Type.heading2,
        icon: TitleIcon,
    },
    {
        name: ['heading3'],
        title: 'Heading 3',
        blockType: Protocol.Block.Type.heading3,
        icon: TitleIcon,
    },
    {
        name: ['code'],
        title: 'Code',
        blockType: Protocol.Block.Type.code,
        icon: CodeBlockInlineIcon as any,
    },
    {
        name: ['bullet'],
        title: 'Bullet List',
        blockType: Protocol.Block.Type.bullet,
        icon: FormatListBulletedIcon,
    },
    {
        name: ['call', 'callout'],
        title: 'Callout',
        blockType: Protocol.Block.Type.callout,
        icon: NotificationsNoneIcon,
    },
    {
        name: ['div', 'divider'],
        title: 'Divider',
        blockType: Protocol.Block.Type.divider,
        icon: HorizontalRuleIcon,
    },
];

export const addMenuList = [...textTypeBlocks].filter(v => v);

export const textConvertMenuList = textTypeBlocks;

export const ignoreBlockTypes: BlockFlavorKeys[] = [
    Protocol.Block.Type.workspace,
    Protocol.Block.Type.page,
    Protocol.Block.Type.group,
    Protocol.Block.Type.title,
    Protocol.Block.Type.grid,
    Protocol.Block.Type.gridItem,
];
