import type { Virgo } from '@toeverything/components/editor-core';
import { services } from '@toeverything/datasource/db-service';
import {
    useCurrentEditors,
    useShowSettingsSidebar,
} from '@toeverything/datasource/state';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CommentInfo } from './type';

export const useComments = () => {
    const { workspaceId, pageId } = useParams();

    const [comments, setComments] = useState<CommentInfo[]>([]);
    const [observeIds, setObserveIds] = useState<string[]>([]);

    const fetchComments = useCallback(async () => {
        if (!workspaceId || !pageId) return;
        const ids = [];
        const pageComment = await services.api.commentService.getPageComments({
            workspace: workspaceId,
            pageId: pageId,
        });
        ids.push(pageComment.id);

        let comments = await services.api.commentService.getComments({
            workspace: workspaceId,
            ids: pageComment?.children,
        });

        comments = await Promise.all(
            comments.map(async comment => {
                const commentInfo = comment as CommentInfo;
                commentInfo.replyList =
                    await services.api.commentService.getReplyList({
                        workspace: workspaceId,
                        ids: comment.children,
                    });
                ids.push(comment.id);
                ids.push(...comment.children);
                return commentInfo;
            })
        );

        setComments(comments.reverse() as CommentInfo[]);
        setObserveIds(ids);
    }, [pageId, workspaceId]);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);

    // first simple implementation
    useEffect(() => {
        const unobserveList: any[] = [];
        observeIds.forEach(async id => {
            const unobserve = await services.api.editorBlock.observe(
                { workspace: workspaceId, id: id },
                block => {
                    fetchComments();
                }
            );
            unobserveList.push(unobserve);
        });
        return () => {
            unobserveList.forEach(unobserve => unobserve?.());
        };
    }, [fetchComments, workspaceId, observeIds]);

    return { comments };
};

export const useActiveComment = () => {
    const { workspaceId, pageId } = useParams();
    const { currentEditors } = useCurrentEditors();
    const editor = useMemo(() => {
        return currentEditors[pageId] as Virgo;
    }, [currentEditors, pageId]);

    const [activeCommentId, setActiveCommentId] = useState('');

    const { setShowSettingsSidebar: setShowInfoSidebar } =
        useShowSettingsSidebar();

    const resolveComment = useCallback(
        (blockId: string, commentId: string) => {
            editor?.blockHelper.resolveComment(blockId, commentId);
        },
        [editor]
    );

    useEffect(() => {
        if (!editor) return;
        editor.selection.onSelectEnd(info => {
            // TODO: only do the following when sidebar is open

            const { type, anchorNode } = info;
            if (type === 'None' || !anchorNode) return;
            const currentSelectionInTextBlock =
                editor.blockHelper.getCurrentSelection(anchorNode.id);
            if (!currentSelectionInTextBlock) return;

            // get possible commentId from selection
            let maybeActiveCommentsIds = [] as string[];

            if (editor.blockHelper.isSelectionCollapsed(anchorNode.id)) {
                // TODO: search before/after for comment text node, improve this
                maybeActiveCommentsIds =
                    editor.blockHelper.getCommentsIdsBySelection(anchorNode.id);
            } else {
                maybeActiveCommentsIds =
                    editor.blockHelper.getCommentsIdsBySelection(anchorNode.id);
            }

            // TODO: set the shortest comment as active comment instead of the first
            setActiveCommentId(
                maybeActiveCommentsIds.length ? maybeActiveCommentsIds[0] : ''
            );
        });
    }, [currentEditors, editor]);

    useEffect(() => {
        if (activeCommentId) {
            setShowInfoSidebar(true);
        }
    }, [activeCommentId, setShowInfoSidebar]);

    return { activeCommentId, resolveComment };
};
