import { useCallback, ChangeEvent, KeyboardEvent } from 'react';
import { styled } from '@toeverything/components/ui';
import { useAddComment } from './use-add-comment';
import { WithEditorSelectionType } from '../menu/inline-menu/types';

type AddCommentInputProps = {
    comment: string;
    setComment: React.Dispatch<React.SetStateAction<string>>;
    createComment: () => Promise<{ commentsId: string }>;
    handleSubmitCurrentComment: () => Promise<void>;
};

export const AddCommentInput = (props: AddCommentInputProps) => {
    const { comment, setComment, handleSubmitCurrentComment } = props;

    const handleTextAreaChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
            setComment(event.currentTarget.value);
        },
        [setComment]
    );

    // 👀 keydown event won't work as expected
    const handleKeyUp = useCallback(
        async (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (!e.metaKey && !e.shiftKey && e.code === 'Enter' && comment) {
                await handleSubmitCurrentComment();
            }
        },
        [comment, handleSubmitCurrentComment]
    );

    return (
        <StyledContainerForAddCommentInput>
            {/* <input type="text" placeholder={'Add comment...'} /> */}
            <StyledTextArea
                placeholder={'Add comment...'}
                value={comment || ''}
                onChange={handleTextAreaChange}
                onKeyUp={handleKeyUp}
            />
        </StyledContainerForAddCommentInput>
    );
};

const StyledContainerForAddCommentInput = styled('div')(({ theme }) => {
    return {
        marginLeft: theme.affine.spacing.iconPadding,
    };
});

const StyledTextArea = styled('textarea')(({ theme }) => {
    return {
        minWidth: 252,
        resize: 'none',
        // color: theme.affine.palette.primaryText,
    };
});
