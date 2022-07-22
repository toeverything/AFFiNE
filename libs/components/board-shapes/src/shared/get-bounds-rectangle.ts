import { TLBounds, TLShape, Utils } from '@tldraw/core';

/**
 * Find the bounds of a rectangular shape.
 * @param shape
 * @param boundsCache
 */
export function getBoundsRectangle<T extends TLShape & { size: number[] }>(
    shape: T,
    boundsCache: WeakMap<T, TLBounds>
) {
    const bounds = Utils.getFromCache(boundsCache, shape, () => {
        const [width, height] = shape.size;
        return {
            minX: 0,
            maxX: width,
            minY: 0,
            maxY: height,
            width,
            height,
        };
    });

    return Utils.translateBounds(bounds, shape.point);
}
