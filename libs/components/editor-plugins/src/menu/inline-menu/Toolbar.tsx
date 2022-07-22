import { useMemo } from 'react';
import { styled } from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';

import type { WithEditorSelectionType } from './types';
import { getInlineMenuData } from './utils';
import { MenuDropdownItem, MenuIconItem } from './menu-item';
import { INLINE_MENU_UI_TYPES } from './config';

const ToolbarItemSeparator = styled('span')(({ theme }) => ({
    display: 'inline-flex',
    marginLeft: theme.affine.spacing.xsSpacing,
    marginRight: theme.affine.spacing.xsSpacing,
    color: theme.affine.palette.menuSeparator,
}));

export const InlineMenuToolbar = ({
    editor,
    selectionInfo,
    setShow,
}: WithEditorSelectionType) => {
    // default value is false
    const enableCommentFeature = useFlag<boolean>('commentDiscussion');

    const inlineMenuData = useMemo(() => {
        const data = getInlineMenuData({ enableCommentFeature });
        return data;
    }, [enableCommentFeature]);

    return (
        <>
            {inlineMenuData.map(menu => {
                const { type, name } = menu;

                if (type === INLINE_MENU_UI_TYPES.dropdown) {
                    return (
                        <MenuDropdownItem
                            {...menu}
                            editor={editor}
                            selectionInfo={selectionInfo}
                            key={name}
                        />
                    );
                }

                if (type === INLINE_MENU_UI_TYPES.separator) {
                    return (
                        <ToolbarItemSeparator key={name}>
                            |
                        </ToolbarItemSeparator>
                    );
                }

                if (type === INLINE_MENU_UI_TYPES.icon) {
                    return (
                        <MenuIconItem
                            {...menu}
                            editor={editor}
                            selectionInfo={selectionInfo}
                            setShow={setShow}
                            key={name}
                        />
                    );
                }

                return null;
            })}
        </>
    );
};
