import { Utils } from '@tldraw/core';
import { getStrokeOutlinePoints, getStrokePoints } from 'perfect-freehand';
import { EASINGS } from '@toeverything/components/board-types';
import type { ShapeStyles } from '@toeverything/components/board-types';
import { getShapeStyle } from '../shared/shape-styles';

export function getEllipseStrokePoints(
    id: string,
    radius: number[],
    style: ShapeStyles
) {
    const { strokeWidth } = getShapeStyle(style);
    const getRandom = Utils.rng(id);
    const rx = radius[0] + getRandom() * strokeWidth * 2;
    const ry = radius[1] + getRandom() * strokeWidth * 2;
    const perimeter = Utils.perimeterOfEllipse(rx, ry);
    const points: number[][] = [];
    const start = Math.PI + Math.PI * getRandom();
    const extra = Math.abs(getRandom());
    const count = Math.max(16, perimeter / 10);
    for (let i = 0; i < count; i++) {
        const t = EASINGS.easeInOutSine(i / (count + 1));
        const rads = start * 2 + Math.PI * (2 + extra) * t;
        const c = Math.cos(rads);
        const s = Math.sin(rads);
        points.push([
            rx * c + radius[0],
            ry * s + radius[1],
            t + 0.5 + getRandom() / 2,
        ]);
    }
    return getStrokePoints(points, {
        size: 1 + strokeWidth * 2,
        thinning: 0.618,
        end: { taper: perimeter / 8 },
        start: { taper: perimeter / 12 },
        streamline: 0,
        simulatePressure: true,
    });
}

export function getEllipsePath(
    id: string,
    radius: number[],
    style: ShapeStyles
) {
    const { strokeWidth } = getShapeStyle(style);
    const getRandom = Utils.rng(id);
    const rx = radius[0] + getRandom() * strokeWidth * 2;
    const ry = radius[1] + getRandom() * strokeWidth * 2;
    const perimeter = Utils.perimeterOfEllipse(rx, ry);
    return Utils.getSvgPathFromStroke(
        getStrokeOutlinePoints(getEllipseStrokePoints(id, radius, style), {
            size: 2 + strokeWidth * 2,
            thinning: 0.618,
            end: { taper: perimeter / 8 },
            start: { taper: perimeter / 12 },
            streamline: 0,
            simulatePressure: true,
        })
    );
}

export function getEllipseIndicatorPath(
    id: string,
    radius: number[],
    style: ShapeStyles
) {
    return Utils.getSvgPathFromStroke(
        getEllipseStrokePoints(id, radius, style).map(pt =>
            pt.point.slice(0, 2)
        ),
        false
    );
}
