import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import getStroke, { getStrokePoints } from 'perfect-freehand';
import type { ShapeStyles } from '@toeverything/components/board-types';
import { getShapeStyle, getOffsetPolygon } from '../shared';

export function getTrianglePoints(size: number[], offset = 0, rotation = 0) {
    const [w, h] = size;
    let points = [
        [w / 2, 0],
        [w, h],
        [0, h],
    ];
    if (offset) points = getOffsetPolygon(points, offset);
    if (rotation)
        points = points.map(pt => Vec.rotWith(pt, [w / 2, h / 2], rotation));

    return points;
}

export function getTriangleCentroid(size: number[]) {
    const [w, h] = size;
    const points = [
        [w / 2, 0],
        [w, h],
        [0, h],
    ];
    return [
        (points[0][0] + points[1][0] + points[2][0]) / 3,
        (points[0][1] + points[1][1] + points[2][1]) / 3,
    ];
}

function getTriangleDrawPoints(
    id: string,
    size: number[],
    strokeWidth: number
) {
    const [w, h] = size;
    const getRandom = Utils.rng(id);
    // Random corner offsets
    const offsets = Array.from(Array(3)).map(() => {
        return [
            getRandom() * strokeWidth * 0.75,
            getRandom() * strokeWidth * 0.75,
        ];
    });
    // Corners
    const corners = [
        Vec.add([w / 2, 0], offsets[0]),
        Vec.add([w, h], offsets[1]),
        Vec.add([0, h], offsets[2]),
    ];
    // Which side to start drawing first
    const rm = Math.round(Math.abs(getRandom() * 2 * 3));
    // Number of points per side
    // Inset each line by the corner radii and let the freehand algo
    // interpolate points for the corners.
    const lines = Utils.rotateArray(
        [
            Vec.pointsBetween(corners[0], corners[1], 32),
            Vec.pointsBetween(corners[1], corners[2], 32),
            Vec.pointsBetween(corners[2], corners[0], 32),
        ],
        rm
    );
    // For the final points, include the first half of the first line again,
    // so that the line wraps around and avoids ending on a sharp corner.
    // This has a bit of finesse and magic—if you change the points between
    // function, then you'll likely need to change this one too.
    const points = [...lines.flat(), ...lines[0]];
    return {
        points,
    };
}

function getDrawStrokeInfo(id: string, size: number[], style: ShapeStyles) {
    const { strokeWidth } = getShapeStyle(style);
    const { points } = getTriangleDrawPoints(id, size, strokeWidth);
    const options = {
        size: strokeWidth,
        thinning: 0.65,
        streamline: 0.3,
        smoothing: 1,
        simulatePressure: false,
        last: true,
    };
    return { points, options };
}

export function getTrianglePath(
    id: string,
    size: number[],
    style: ShapeStyles
) {
    const { points, options } = getDrawStrokeInfo(id, size, style);
    const stroke = getStroke(points, options);
    return Utils.getSvgPathFromStroke(stroke);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function getTriangleIndicatorPathTDSnapshot(
    id: string,
    size: number[],
    style: ShapeStyles
) {
    const { points, options } = getDrawStrokeInfo(id, size, style);
    const strokePoints = getStrokePoints(points, options);
    return Utils.getSvgPathFromStroke(
        strokePoints.map(pt => pt.point.slice(0, 2)),
        false
    );
}
