import { BaseEditor } from 'slate';
import { ReactEditor } from 'slate-react';
import { LinkElement } from './text/plugins/link';
import { RefLinkElement } from './text/plugins/reflink';

export type CustomText = { text: string };
export type CustomElement =
    | { type: string; children: CustomElement[] }
    | CustomText
    | LinkElement
    | RefLinkElement;
declare module 'slate' {
    interface CustomTypes {
        Editor: BaseEditor & ReactEditor;
        Element: CustomElement;
        Text: CustomText;
    }
}

export { BlockPreview, StyledBlockPreview } from './block-preview';
export { default as Button } from './button';
export type { CommonListItem } from './list';
export { CommonList, BackLink, commonListContainer } from './list';
export * from './Logo';
export { default as Toolbar } from './toolbar';
export { CollapsibleTitle } from './collapsible-title';

export * from './text';

export {
    NewpageIcon,
    ClockIcon,
    ViewSidebarIcon,
    ListIcon,
    SpaceIcon,
    PencilDotDuotoneIcon,
    PencilDuotoneIcon,
    HighlighterDuotoneIcon,
    CodeBlockInlineIcon,
    PagesIcon,
    CloseIcon,
    DocumentIcon,
    TodoListIcon,
    KanbanIcon,
    TableIcon,
    AddIcon,
    FilterIcon,
    SorterIcon,
    FullScreenIcon,
    UnGroupIcon,
} from './icon';
