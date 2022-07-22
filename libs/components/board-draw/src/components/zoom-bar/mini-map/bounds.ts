import type { TLBounds, TLPageState } from '@tldraw/core';

const getOffsetBound = (bound: TLBounds, commonBound: TLBounds): TLBounds => {
    return {
        width: bound.width,
        height: bound.height,
        minX: bound.minX - commonBound.minX,
        maxX: bound.maxX - commonBound.maxX,
        minY: bound.minY - commonBound.minY,
        maxY: bound.maxY - commonBound.maxY,
    };
};

const getScaledBound = (bound: TLBounds, scale: number): TLBounds => {
    return {
        width: bound.width / scale,
        height: bound.height / scale,
        minX: bound.minX / scale,
        maxX: bound.maxX / scale,
        minY: bound.minY / scale,
        maxY: bound.maxY / scale,
    };
};

interface ProcessBoundProps {
    bound: TLBounds;
    scale: number;
    commonBound: TLBounds;
}

export const processBound = ({
    bound,
    scale,
    commonBound,
}: ProcessBoundProps) => {
    let boundResult = bound;
    boundResult = getOffsetBound(boundResult, commonBound);
    boundResult = getScaledBound(boundResult, scale);
    return boundResult;
};

export const getViewportBound = (
    rendererBounds: TLBounds,
    camera: TLPageState['camera']
): TLBounds => {
    const [cameraX, cameraY] = camera.point;
    const zoom = camera.zoom;
    const minX = 0 - cameraX;
    const minY = 0 - cameraY;
    const width = rendererBounds.width / zoom;
    const height = rendererBounds.height / zoom;
    return {
        width,
        height,
        minX,
        maxX: minX + width,
        minY,
        maxY: minY + height,
    };
};
