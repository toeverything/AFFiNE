import { useState, useEffect } from 'react';
import { Protocol } from '@toeverything/datasource/db-service';
import {
    MuiClickAwayListener as ClickAwayListener,
    MuiGrow as Grow,
    styled,
} from '@toeverything/components/ui';

import { Virgo, SelectionInfo } from '@toeverything/framework/virgo';
import { InlineMenuToolbar } from './Toolbar';

export type InlineMenuContainerProps = {
    editor: Virgo;
};

export const InlineMenuContainer = ({ editor }: InlineMenuContainerProps) => {
    const [showMenu, setShowMenu] = useState(false);
    const [containerStyle, setContainerStyle] = useState<{
        left: number;
        top: number;
    }>(null);
    const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>();

    useEffect(() => {
        // const unsubscribe = editor.selection.onSelectionChange(info => {
        const unsubscribe = editor.selection.onSelectEnd(async info => {
            const { type, browserSelection, anchorNode } = info;
            if (anchorNode) {
                const activeBlock = await editor.getBlockById(anchorNode.id);
                if (activeBlock.type === Protocol.Block.Type.page) {
                    return;
                }
            }
            if (
                type === 'None' ||
                !anchorNode ||
                !browserSelection ||
                browserSelection?.isCollapsed ||
                // 👀 inline-toolbar should support more block types except Text
                // anchorNode.type !== 'text'
                !editor.blockHelper.getCurrentSelection(anchorNode.id) ||
                editor.blockHelper.isSelectionCollapsed(anchorNode.id)
            ) {
                setShowMenu(false);
                return;
            }

            // This is relative to window
            const rect = browserSelection.getRangeAt(0).getBoundingClientRect();
            const { top, left } = editor.container.getBoundingClientRect();
            setSelectionInfo(info);
            setShowMenu(true);
            setContainerStyle({
                left: rect.left - left,
                top: rect.top - top - 64,
            });
        });
        return unsubscribe;
    }, [editor]);

    return showMenu && containerStyle ? (
        <Grow
            in={showMenu}
            style={{ transformOrigin: '0 0 0' }}
            {...{ timeout: 'auto' }}
        >
            <ToolbarContainer
                style={containerStyle}
                onMouseDown={e => {
                    // prevent toolbar from taking focus away from editor
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <InlineMenuToolbar
                    editor={editor}
                    selectionInfo={selectionInfo}
                    setShow={setShowMenu}
                />
            </ToolbarContainer>
        </Grow>
    ) : null;
};

const ToolbarContainer = styled('div')(({ theme }) => ({
    position: 'absolute',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderRadius: '10px',
    boxShadow: theme.affine.shadows.shadow1,
    backgroundColor: '#fff',
}));
