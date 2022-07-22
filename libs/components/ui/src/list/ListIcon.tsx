import { styled } from '../styled';

export const ListIcon = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.icons,
        height: '20px',

        '& svg': {
            fontSize: '20px',
        },
    };
});
