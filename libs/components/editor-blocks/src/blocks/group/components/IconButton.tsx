import { styled } from '@toeverything/components/ui';
import type { CSSProperties } from 'react';

export const IconButton = styled('div')<{
    extraStyle?: CSSProperties;
    active?: boolean;
}>(({ extraStyle, active }) => ({
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    color: '#98ACBD',
    fontSize: 14,
    ...extraStyle,

    '& > svg': {
        marginRight: 4,
    },
    '&:hover': {
        background: '#F5F7F8',
        borderRadius: 5,
    },
    ...(active && {
        background: '#F5F7F8',
        borderRadius: 5,
        color: '#3E6FDB',
    }),
}));
