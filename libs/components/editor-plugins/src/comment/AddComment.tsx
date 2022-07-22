import { styled } from '@toeverything/components/ui';
import { WithEditorSelectionType } from '../menu/inline-menu/types';
import { AddCommentActions } from './AddCommentActions';
import { AddCommentInput } from './AddCommentInput';
import { useAddComment } from './use-add-comment';

export const AddComment = (props: WithEditorSelectionType) => {
    const {
        currentComment,
        setCurrentComment,
        createComment,
        handleSubmitCurrentComment,
    } = useAddComment(props);

    return (
        <StyledContainerForAddComment>
            <AddCommentInput
                comment={currentComment}
                setComment={setCurrentComment}
                createComment={createComment}
                handleSubmitCurrentComment={handleSubmitCurrentComment}
            />
            <AddCommentActions
                {...props}
                createComment={createComment}
                handleSubmitCurrentComment={handleSubmitCurrentComment}
            />
        </StyledContainerForAddComment>
    );
};

const StyledContainerForAddComment = styled('div')(({ theme }) => {
    return {
        // display: 'flex',
        margin: theme.affine.spacing.main,
    };
});
