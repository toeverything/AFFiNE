import { Tooltip } from '@toeverything/components/ui';
import React, { useCallback } from 'react';
import style9 from 'style9';
import { inlineMenuNamesKeys, inlineMenuShortcuts } from '../config';
import type { IconItemType, WithEditorSelectionType } from '../types';

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
                    setShow,
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
            <button
                onClick={handleToolbarItemClick}
                className={styles('currentIcon')}
                aria-label={name}
            >
                <MenuIcon sx={{ width: 20, height: 20 }} />
            </button>
        </Tooltip>
    );
};

const styles = style9.create({
    currentIcon: {
        display: 'inline-flex',
        padding: '0',
        margin: '15px 6px',
        color: '#98acbd',
        ':hover': { backgroundColor: 'transparent' },
    },
});
