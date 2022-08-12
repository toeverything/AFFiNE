import { DoneIcon } from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';

type QuotedContentProps = {
    content: string;
    onToggle: () => void;
};

export const QuotedContent = ({ content, onToggle }: QuotedContentProps) => {
    return (
        <StyledContainerForQuotedContent>
            <StyledVerticalLine />
            <StyledQuotedContent>{content || ''}</StyledQuotedContent>
            <StyledResolveAction onClick={onToggle} fontSize="small" />
        </StyledContainerForQuotedContent>
    );
};

const StyledContainerForQuotedContent = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        // marginBottom: theme.affine.spacing.xsSpacing,
        marginBottom: 6,
    };
});

const StyledVerticalLine = styled('div')(({ theme }) => {
    return {
        width: 2,
        height: 18,
        marginRight: theme.affine.spacing.smSpacing,
        backgroundColor: '#97EEF2',
    };
});

const StyledQuotedContent = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.primaryText,
        flex: '1 1 0',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
    };
});

const StyledResolveAction = styled(DoneIcon)(({ theme }) => {
    return {
        marginLeft: theme.affine.spacing.xsSpacing,
        color: theme.affine.palette.primary,
        // fontSize: '1.2rem',
        cursor: 'pointer',
    };
});
