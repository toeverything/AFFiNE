import type { SvgIconProps } from '@toeverything/components/ui';
import type { SelectionInfo, Virgo } from '@toeverything/framework/virgo';
import { inlineMenuNames, INLINE_MENU_UI_TYPES } from './config';

export type WithEditorSelectionType = {
    editor: Virgo;
    selectionInfo: SelectionInfo;
    setShow?: React.Dispatch<React.SetStateAction<boolean>>;
};

export type InlineMenuNamesType = keyof typeof inlineMenuNames;

export type ClickItemHandler = ({
    type,
    editor,
    anchorNodeId,
    setShow,
}: {
    type: InlineMenuNamesType;
    editor: Virgo;
    anchorNodeId: string;
    setShow?: React.Dispatch<React.SetStateAction<boolean>>;
}) => void;

export type IconItemType = {
    type: typeof INLINE_MENU_UI_TYPES['icon'];
    icon: (prop: SvgIconProps) => JSX.Element;
    nameKey: InlineMenuNamesType;
    name: typeof inlineMenuNames[InlineMenuNamesType];
    onClick?: ClickItemHandler;
    active?: boolean;
};

export type DropdownItemType = {
    type: typeof INLINE_MENU_UI_TYPES['dropdown'];
    icon: (prop: SvgIconProps) => JSX.Element;
    nameKey: InlineMenuNamesType;
    name: typeof inlineMenuNames[InlineMenuNamesType];
    children: IconItemType[];
    activeKey?: InlineMenuNamesType;
};

type SeparatorMenuItem = {
    type: typeof INLINE_MENU_UI_TYPES['separator'];
    name: string;
};

export type InlineMenuItem =
    | IconItemType
    | DropdownItemType
    | SeparatorMenuItem;
