import { services } from '@toeverything/datasource/db-service';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { WithEditorSelectionType } from '../menu/inline-menu/types';

export const useAddComment = ({
    editor,
    selectionInfo,
    setShow,
}: WithEditorSelectionType) => {
    const { workspaceId, pageId } = useParams();
    const [currentComment, setCurrentComment] = useState('');

    const createComment = useCallback(async (): Promise<{
        commentsId: string;
    }> => {
        const selectedBlockId = selectionInfo?.anchorNode?.id;
        if (!currentComment || !currentComment.trim()) {
            throw new Error(
                'Comment content must not be empty before creating in db. '
            );
        }
        if (!selectedBlockId) {
            throw new Error(
                'Commented block id must not be empty before creating in db. '
            );
        }

        const created = await services.api.commentService.createComment({
            workspace: workspaceId,
            pageId: pageId,
            attachedToBlocksIds: [selectionInfo.anchorNode.id],
            quote: {
                value: [
                    {
                        text: editor.blockHelper.getBlockTextBetweenSelection(
                            selectedBlockId
                        ),
                    },
                ],
            },
            content: {
                value: [{ text: currentComment }],
            },
        });

        return created;
    }, [
        currentComment,
        editor.blockHelper,
        pageId,
        selectionInfo?.anchorNode?.id,
        workspaceId,
    ]);

    const handleSubmitCurrentComment = useCallback(async () => {
        const textBlockId = selectionInfo.anchorNode.id;
        if (!textBlockId) return;
        const created = await createComment();
        const commentId = created?.commentsId;

        if (commentId) {
            editor.blockHelper.addComment(textBlockId, commentId);
            setShow(false);
        }
    }, [
        createComment,
        editor.blockHelper,
        selectionInfo.anchorNode.id,
        setShow,
    ]);
    return {
        currentComment,
        setCurrentComment,
        createComment,
        handleSubmitCurrentComment,
    };
};
