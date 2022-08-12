import { MuiClickAwayListener, styled } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { Fragment, useCallback, useEffect, useState } from 'react';

import { QuotedContent } from './item/QuotedContent';
import { ReplyInput } from './item/ReplyInput';
import { ReplyItem } from './item/ReplyItem';
import { CommentInfo } from './type';

export const CommentItem = (props: CommentInfo) => {
    const {
        id,
        workspace,
        attachedToBlocksIds,
        quote,
        replyList,
        resolve,
        activeCommentId,
        resolveComment,
    } = props;
    const [isActive, setIsActive] = useState(false);

    const handleSubmitComment = useCallback(
        async (value: string) => {
            await services.api.commentService.createReply({
                workspace,
                parentId: id,
                content: { value: [{ text: value }] },
            });
        },
        [id, workspace]
    );

    const handleToggleResolveComment = useCallback(async () => {
        resolveComment(attachedToBlocksIds[0], id);
        await services.api.commentService.updateComment({
            workspace,
            id,
            attachedToBlocksIds,
            resolve: !resolve,
        });
    }, [attachedToBlocksIds, id, resolve, resolveComment, workspace]);

    useEffect(() => {
        if (activeCommentId === id) {
            setIsActive(true);
        } else {
            setIsActive(false);
        }
    }, [activeCommentId, id]);

    return (
        <MuiClickAwayListener onClickAway={() => setIsActive(false)}>
            <StyledContainerForCommentItem
                isActive={isActive}
                onClick={() => setIsActive(true)}
            >
                <StyledItemContent>
                    <QuotedContent
                        content={quote.value[0].text}
                        onToggle={handleToggleResolveComment}
                    />
                    {replyList?.map((reply, index) => {
                        if (index === replyList.length - 1) {
                            return <ReplyItem {...reply} key={reply.id} />;
                        }

                        return (
                            <Fragment key={reply.id}>
                                <ReplyItem {...reply} />
                                <StyledReplySeparator />
                            </Fragment>
                        );
                    })}
                    {isActive ? (
                        <ReplyInput onSubmit={handleSubmitComment} />
                    ) : null}
                </StyledItemContent>
            </StyledContainerForCommentItem>
        </MuiClickAwayListener>
    );
};

const StyledContainerForCommentItem = styled('div', {
    shouldForwardProp: (prop: string) => !['isActive'].includes(prop),
})<{ isActive?: boolean }>(({ theme, isActive }) => {
    return {
        position: 'relative',
        width: 322,
        border: `2px solid ${theme.affine.palette.menuSeparator}`,
        borderRadius: theme.affine.shape.borderRadius,
        marginBottom: theme.affine.spacing.smSpacing,
        left: isActive ? -58 : 0,
        transition: 'left 150ms ease-in-out',
        backgroundColor: theme.affine.palette.white,
        '&:hover': {
            boxShadow: theme.affine.shadows.shadow1,
        },
    };
});

const StyledItemContent = styled('div')(({ theme }) => {
    return {
        marginLeft: theme.affine.spacing.main,
        marginRight: theme.affine.spacing.main,
        marginTop: theme.affine.spacing.smSpacing,
        marginBottom: theme.affine.spacing.smSpacing,
    };
});

const StyledReplySeparator = styled('div')(({ theme }) => {
    return {
        width: 290,
        height: 1,
        marginTop: 6,
        marginBottom: 6,
        color: theme.affine.palette.menuSeparator,
        backgroundColor: theme.affine.palette.menuSeparator,
    };
});
