import { BaseEditor } from 'slate';
import { ReactEditor } from 'slate-react';
import { DoubleLinkElement } from './text/plugins/DoubleLink';
import { LinkElement } from './text/plugins/link';
import { RefLinkElement } from './text/plugins/reflink';

export type CustomText = { text: string };
export type CustomElement =
    | { type: string; children: CustomElement[] }
    | CustomText
    | LinkElement
    | RefLinkElement
    | DoubleLinkElement;
declare module 'slate' {
    interface CustomTypes {
        Editor: BaseEditor & ReactEditor;
        Element: CustomElement;
        Text: CustomText;
    }
}

export { BlockPreview, StyledBlockPreview } from './block-preview';
export { default as Button } from './button';
export { CollapsibleTitle } from './collapsible-title';
export * from './comming-soon/CommingSoon';
export {
    AddIcon,
    ClockIcon,
    CloseIcon,
    CodeBlockInlineIcon,
    DocumentIcon,
    FilterIcon,
    FullScreenIcon,
    HighlighterDuotoneIcon,
    KanbanIcon,
    ListIcon,
    NewpageIcon,
    PagesIcon,
    PencilDotDuotoneIcon,
    PencilDuotoneIcon,
    SorterIcon,
    SpaceIcon,
    TableIcon,
    TodoListIcon,
    UnGroupIcon,
    ViewSidebarIcon,
} from './icon';
export { BackLink, CommonList, commonListContainer } from './list';
export type { CommonListItem } from './list';
export * from './Logo';
export * from './text';
export { default as Toolbar } from './toolbar';
