import type { FC, CSSProperties } from 'react';
import type { TLBounds } from '@tldraw/core';
import { styled } from '@toeverything/components/ui';

interface SimplifiedShapeProps extends TLBounds {
    onClick?: () => void;
}

export const SimplifiedShape = ({
    onClick,
    width,
    height,
    minX,
    minY,
}: SimplifiedShapeProps) => {
    const style: CSSProperties = {
        width: `${width}px`,
        height: `${height}px`,
        left: `${minX}px`,
        top: `${minY}px`,
    };
    return <Container style={style} onClick={onClick} />;
};

const Container = styled('div')(({ theme }) => ({
    position: 'absolute',
    backgroundColor: theme.affine.palette.icons,
    opacity: 0.2,
    cursor: 'pointer',

    // eslint-disable-next-line @typescript-eslint/naming-convention
    '&:hover': {
        opacity: 0.8,
    },
}));
