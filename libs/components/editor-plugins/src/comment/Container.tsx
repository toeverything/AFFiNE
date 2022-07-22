import { useState, useEffect } from 'react';
import {
    styled,
    MuiClickAwayListener as ClickAwayListener,
} from '@toeverything/components/ui';
import {
    Virgo,
    PluginHooks,
    SelectionInfo,
} from '@toeverything/framework/virgo';
import { AddComment } from './AddComment';

export type AddCommentPluginContainerProps = {
    editor: Virgo;
    hooks: PluginHooks;
    style?: { left: number; top: number };
};

export const AddCommentPluginContainer = ({
    editor,
    hooks,
    style,
}: AddCommentPluginContainerProps) => {
    const [showAddComment, setShowAddComment] = useState(false);
    const [containerStyle, setContainerStyle] = useState<{
        left: number;
        top: number;
    }>(null);
    const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>();

    useEffect(() => {
        const showAddCommentInput = () => {
            setShowAddComment(true);
            const rect = editor.selection?.currentSelectInfo?.browserSelection
                ?.getRangeAt(0)
                ?.getBoundingClientRect();
            if (rect) {
                setSelectionInfo(editor.selection.currentSelectInfo);
                setContainerStyle({ left: rect.left, top: rect.top + 32 });
            }
        };
        editor.plugins.observe('show-add-comment', showAddCommentInput);

        return () =>
            editor.plugins.unobserve('show-add-comment', showAddCommentInput);
    }, [editor.plugins, editor.selection.currentSelectInfo]);

    return showAddComment && containerStyle ? (
        <ClickAwayListener onClickAway={() => setShowAddComment(false)}>
            <StyledContainerForAddCommentContainer style={containerStyle}>
                <AddComment
                    editor={editor}
                    selectionInfo={selectionInfo}
                    setShow={setShowAddComment}
                />
            </StyledContainerForAddCommentContainer>
        </ClickAwayListener>
    ) : null;
};

const StyledContainerForAddCommentContainer = styled('div')(({ theme }) => {
    return {
        position: 'fixed',
        zIndex: 1,
        display: 'flex',
        borderRadius: theme.affine.shape.borderRadius,
        boxShadow: theme.affine.shadows.shadowSxDownLg,
        backgroundColor: theme.affine.palette.white,
    };
});
