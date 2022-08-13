import React, { useCallback } from 'react';

import type { IconItemType, WithEditorSelectionType } from '../types';
import { inlineMenuNamesKeys, inlineMenuShortcuts } from '../config';
import { styled, Tooltip } from '@toeverything/components/ui';
type MenuIconItemProps = IconItemType & WithEditorSelectionType;

export const MenuIconItem = ({
    name,
    nameKey,
    icon: MenuIcon,
    onClick,
    editor,
    selectionInfo,
    setShow,
}: MenuIconItemProps) => {
    const handleToolbarItemClick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            if (onClick && selectionInfo?.anchorNode?.id) {
                onClick({
                    editor,
                    type: nameKey,
                    anchorNodeId: selectionInfo?.anchorNode?.id,
                });
            }
            if ([inlineMenuNamesKeys.comment].includes(nameKey)) {
                setShow(false);
            }
            if (inlineMenuNamesKeys.comment === nameKey) {
                editor.plugins.emit('show-add-comment');
            }
        },
        [editor, nameKey, onClick, selectionInfo?.anchorNode?.id, setShow]
    );

    //@ts-ignore
    const shortcut = inlineMenuShortcuts[nameKey];

    return (
        <Tooltip
            content={
                <div style={{ padding: '2px 4px' }}>
                    <p>{name}</p>
                    {shortcut && <p>{shortcut}</p>}
                </div>
            }
            placement="top"
            trigger="hover"
        >
            <CurrentIcon onClick={handleToolbarItemClick} aria-label={name}>
                <MenuIcon sx={{ width: 20, height: 20 }} />
            </CurrentIcon>
        </Tooltip>
    );
};

const CurrentIcon = styled('button')(() => ({
    display: 'inline-flex',
    padding: '0',
    margin: '15px 6px',
    color: '#98acbd',
    ':hover': { backgroundColor: 'transparent' },
}));
