import { styled } from '@toeverything/components/ui';

export const LayoutSettings = () => {
    return (
        <StyledText>
            <p>Layout Settings Coming Soon...</p>
        </StyledText>
    );
};

const StyledText = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'center',
        color: theme.affine.palette.menu,
        marginTop: theme.affine.spacing.lgSpacing,
    };
});
