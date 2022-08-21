import type { TLBounds } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { alpha, styled } from '@toeverything/components/ui';
import type { CSSProperties, PointerEventHandler } from 'react';
import { useRef, useState } from 'react';

interface ViewportProps extends TLBounds {
    onPan?: (delta: [number, number]) => void;
}

export const Viewport = ({
    onPan,
    width,
    height,
    minX,
    minY,
}: ViewportProps) => {
    const style: CSSProperties = {
        width: `${width}px`,
        height: `${height}px`,
        left: `${minX}px`,
        top: `${minY}px`,
    };
    const [dragging, setDragging] = useState(false);
    const lastPosition = useRef<[number, number]>([0, 0]);
    const onPointerDown: PointerEventHandler<HTMLDivElement> = e => {
        setDragging(true);
        lastPosition.current = [e.clientX, e.clientY];
        const onPointerMove = (ev: PointerEvent) => {
            const newPosition = [ev.clientX, ev.clientY];
            const delta = Vec.sub(newPosition, lastPosition.current);
            lastPosition.current = newPosition as [number, number];
            onPan?.(delta as [number, number]);
        };
        const onPointerUp = () => {
            lastPosition.current = [0, 0];
            setDragging(false);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };
    return (
        <Container
            style={style}
            onPointerDown={onPointerDown}
            dragging={dragging}
        />
    );
};

const Container = styled('div')<{ dragging?: boolean }>(
    ({ theme, dragging }) => ({
        position: 'absolute',
        borderColor: theme.affine.palette.primary,
        borderWidth: '1px',
        borderStyle: 'solid',
        cursor: 'pointer',
        backgroundColor: dragging
            ? alpha(theme.affine.palette.icons, 0.2)
            : 'unset',

        // eslint-disable-next-line @typescript-eslint/naming-convention
        '&:hover': {
            backgroundColor: alpha(theme.affine.palette.icons, 0.2),
        },
    })
);
