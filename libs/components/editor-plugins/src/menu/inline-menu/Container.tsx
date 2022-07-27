import { useState, useEffect } from 'react';
import style9 from 'style9';
import {
    MuiClickAwayListener as ClickAwayListener,
    MuiGrow as Grow,
} from '@toeverything/components/ui';

import {
    Virgo,
    PluginHooks,
    SelectionInfo,
} from '@toeverything/framework/virgo';
import { InlineMenuToolbar } from './Toolbar';

export type InlineMenuContainerProps = {
    style?: { left: number; top: number };
    editor: Virgo;
    hooks: PluginHooks;
};

export const InlineMenuContainer = ({
    editor,
    style,
    hooks,
}: InlineMenuContainerProps) => {
    const [showMenu, setShowMenu] = useState(false);
    const [containerStyle, setContainerStyle] = useState<{
        left: number;
        top: number;
    }>(null);
    const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>();

    useEffect(() => {
        // const unsubscribe = editor.selection.onSelectionChange(info => {
        const unsubscribe = editor.selection.onSelectEnd(info => {
            const { type, browserSelection, anchorNode } = info;
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
                return;
            }

            const rect = browserSelection.getRangeAt(0).getBoundingClientRect();

            setSelectionInfo(info);
            setShowMenu(true);
            setContainerStyle({ left: rect.left, top: rect.top - 64 });
        });
        return unsubscribe;
    }, [editor]);

    useEffect(() => {
        const hideInlineMenu = () => {
            setShowMenu(false);
        };
        editor.plugins.observe('hide-inline-menu', hideInlineMenu);

        return () =>
            editor.plugins.unobserve('hide-inline-menu', hideInlineMenu);
    }, [editor.plugins]);

    return showMenu && containerStyle ? (
        <ClickAwayListener onClickAway={() => setShowMenu(false)}>
            <Grow
                in={showMenu}
                style={{ transformOrigin: '0 0 0' }}
                {...{ timeout: 'auto' }}
            >
                <div
                    style={containerStyle}
                    className={styles('toolbarContainer')}
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
                </div>
            </Grow>
        </ClickAwayListener>
    ) : null;
};

const styles = style9.create({
    toolbarContainer: {
        position: 'fixed',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        borderRadius: '10px',
        boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
        backgroundColor: '#fff',
    },
});
