import { styled } from '../styled';

interface ClickableProps {
    active?: boolean;
}

export const Clickable = styled('div')<ClickableProps>(({ theme, active }) => {
    return {
        ...theme.affine.typography.sm,
        backgroundColor: active
            ? theme.affine.palette.hover
            : theme.affine.palette.white,
        cursor: 'pointer',
        color: theme.affine.palette.menu,
        borderRadius: '5px',

        '&:hover': {
            backgroundColor: theme.affine.palette.hover,
        },
    };
});
