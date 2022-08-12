import { styled } from '@toeverything/components/ui';
import { CommentItem } from './CommentItem';
import { useComments } from './use-comments';

type CommentsProps = {
    activeCommentId: string;
    resolveComment: (blockId: string, commentId: string) => void;
};

export const Comments = ({
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
