import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import getStroke, { getStrokePoints } from 'perfect-freehand';
import type { ShapeStyles } from '@toeverything/components/board-types';
import { getShapeStyle, getOffsetPolygon } from '../shared';
function getPonits(w: number, h: number) {
    return [
        [0, (76 / 200) * h],
        [(76 / 200) * w, (76 / 200) * h],
        [(100 / 200) * w, 0],
        [(124 / 200) * w, (76 / 200) * h],
        [(200 / 200) * w, (76 / 200) * h],
        [(138 / 200) * w, (124 / 200) * h],
        [(162 / 200) * w, (200 / 200) * h],
        [(100 / 200) * w, (153 / 200) * h],
        [(38 / 200) * w, (200 / 200) * h],
        [(62 / 200) * w, (124 / 200) * h],
    ];
}

export function getPentagramPoints(size: number[], offset = 0, rotation = 0) {
    const [w, h] = size;
    let points = getPonits(w, h);
    if (offset) points = getOffsetPolygon(points, offset);
    if (rotation)
        points = points.map(pt => Vec.rotWith(pt, [w / 2, h / 2], rotation));

    return points;
}

export function getPentagramCentroid(size: number[]) {
    const [w, h] = size;
    const points = getPonits(w, h);
    return [
        (points[0][0] + points[1][0] + points[2][0]) / 3,
        (points[0][1] + points[1][1] + points[2][1]) / 3,
    ];
}

function getPentagramDrawPoints(
    id: string,
    size: number[],
    strokeWidth: number
) {
    const [w, h] = size;
    const getRandom = Utils.rng(id);
    // Random corner offsets
    const offsets = Array.from(Array(10)).map(() => {
        return [
            getRandom() * strokeWidth * 0.75,
            getRandom() * strokeWidth * 0.75,
        ];
    });
    // Corners
    const point = getPonits(w, h);
    const corners = [
        Vec.add(point[0], offsets[0]),
        Vec.add(point[1], offsets[1]),
        Vec.add(point[2], offsets[2]),
        Vec.add(point[3], offsets[3]),
        Vec.add(point[4], offsets[4]),
        Vec.add(point[5], offsets[5]),
        Vec.add(point[6], offsets[6]),
        Vec.add(point[7], offsets[7]),
        Vec.add(point[8], offsets[8]),
        Vec.add(point[9], offsets[9]),
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
            Vec.pointsBetween(corners[2], corners[3], 32),
            Vec.pointsBetween(corners[3], corners[4], 32),
            Vec.pointsBetween(corners[4], corners[5], 32),
            Vec.pointsBetween(corners[5], corners[6], 32),
            Vec.pointsBetween(corners[6], corners[7], 32),
            Vec.pointsBetween(corners[7], corners[8], 32),
            Vec.pointsBetween(corners[8], corners[9], 32),
            Vec.pointsBetween(corners[9], corners[0], 32),
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
    const { points } = getPentagramDrawPoints(id, size, strokeWidth);
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

export function getPentagramPath(
    id: string,
    size: number[],
    style: ShapeStyles
) {
    const { points, options } = getDrawStrokeInfo(id, size, style);
    const stroke = getStroke(points, options);
    return Utils.getSvgPathFromStroke(stroke);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function getPentagramIndicatorPathTDSnapshot(
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
