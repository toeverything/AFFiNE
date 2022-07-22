import React, { type FC } from 'react';
import type { SvgIconProps } from '@toeverything/components/ui';
import type { Virgo, SelectionInfo } from '@toeverything/framework/virgo';
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
}: {
    type: InlineMenuNamesType;
    editor: Virgo;
    anchorNodeId: string;
}) => void;

export type IconItemType = {
    type: typeof INLINE_MENU_UI_TYPES['icon'];
    icon: FC<SvgIconProps>;
    nameKey: InlineMenuNamesType;
    name: typeof inlineMenuNames[InlineMenuNamesType];
    onClick?: ClickItemHandler;
    active?: boolean;
};

export type DropdownItemType = {
    type: typeof INLINE_MENU_UI_TYPES['dropdown'];
    icon: FC<SvgIconProps>;
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
