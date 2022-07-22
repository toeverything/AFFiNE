import { styled } from '@toeverything/components/ui';

type CommentContentProps = {
    content: string;
};

export const CommentContent = ({ content }: CommentContentProps) => {
    return (
        <StyledContainerForCommentContent>
            <p>{content || ''}</p>
        </StyledContainerForCommentContent>
    );
};

const StyledContainerForCommentContent = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        color: theme.affine.palette.primaryText,
        marginTop: theme.affine.spacing.xsSpacing,
    };
});
