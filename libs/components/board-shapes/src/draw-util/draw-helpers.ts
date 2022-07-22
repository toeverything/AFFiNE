import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import {
    getStrokeOutlinePoints,
    getStrokePoints,
    StrokeOptions,
} from 'perfect-freehand';
import type { DrawShape } from '@toeverything/components/board-types';
import { getShapeStyle } from '../shared/shape-styles';

const simulatePressureSettings: StrokeOptions = {
    easing: t => Math.sin((t * Math.PI) / 2),
    simulatePressure: true,
};

const realPressureSettings: StrokeOptions = {
    easing: t => t * t,
    simulatePressure: false,
};

export function getFreehandOptions(shape: DrawShape) {
    const styles = getShapeStyle(shape.style);

    const options: StrokeOptions = {
        size: 1 + styles.strokeWidth * 1.5,
        thinning: 0.65,
        streamline: 0.65,
        smoothing: 0.65,
        ...(shape.points[1][2] === 0.5
            ? simulatePressureSettings
            : realPressureSettings),
        last: shape.isComplete,
    };

    return options;
}

export function getFillPath(shape: DrawShape) {
    if (shape.points.length < 2) return '';

    return Utils.getSvgPathFromStroke(
        getStrokePoints(shape.points, getFreehandOptions(shape)).map(
            pt => pt.point
        )
    );
}

export function getDrawStrokePoints(shape: DrawShape, options: StrokeOptions) {
    return getStrokePoints(shape.points, options);
}

/**
 * Get path data for a stroke with the DashStyle.Draw dash style.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function getDrawStrokePathTDSnapshot(shape: DrawShape) {
    if (shape.points.length < 2) return '';
    const options = getFreehandOptions(shape);
    const strokePoints = getDrawStrokePoints(shape, options);
    const path = Utils.getSvgPathFromStroke(
        getStrokeOutlinePoints(strokePoints, options)
    );
    return path;
}

/**
 * Get SVG path data for a shape that has a DashStyle other than DashStyles.Draw.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function getSolidStrokePathTDSnapshot(shape: DrawShape) {
    const { points } = shape;
    if (points.length < 2) return 'M 0 0 L 0 0';
    const options = getFreehandOptions(shape);
    const strokePoints = getDrawStrokePoints(shape, options).map(pt =>
        pt.point.slice(0, 2)
    );
    const last = points[points.length - 1].slice(0, 2);
    if (!Vec.isEqual(strokePoints[0], last)) strokePoints.push(last);
    const path = Utils.getSvgPathFromStroke(strokePoints, false);
    return path;
}
