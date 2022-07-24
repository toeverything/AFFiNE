import { styled } from '@toeverything/components/ui';

export const List = styled('div')(({ theme }) => ({
    display: 'flex',
    '.checkBoxContainer': {
        marginRight: '4px',
        lineHeight: theme.affine.typography.body1.lineHeight,
    },
    '.textContainer': {
        flex: 1,
        maxWidth: '100%',
        overflowX: 'hidden',
        overflowY: 'hidden',
    },
}));
export const LinkContainer = styled('div')(() => ({
    position: 'relative',
}));
