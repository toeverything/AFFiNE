import { styled } from '@toeverything/components/ui';
import { CommentItem } from './CommentItem';
import { useComments } from './use-comments';

type CommentsProps = {
    activeCommentId: string;
    resolveComment: (blockId: string, commentId: string) => void;
};

export const Comments = (props: CommentsProps) => {
    return <StyledText>Comment coming soon...</StyledText>;
};

const StyledText = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'center',
        color: theme.affine.palette.menu,
        marginTop: theme.affine.spacing.lgSpacing,
    };
});

export const BakComments = ({
    activeCommentId,
    resolveComment,
}: CommentsProps) => {
    const { comments } = useComments();

    return (
        <StyledContainerForComments className="id-comments-panel">
            {comments?.map(comment => {
                return (
                    <CommentItem
                        {...comment}
                        activeCommentId={activeCommentId}
                        resolveComment={resolveComment}
                        key={comment.id}
                    />
                );
            })}
        </StyledContainerForComments>
    );
};

const StyledContainerForComments = styled('div')(({ theme }) => {
    return {
        position: 'relative',
    };
});
