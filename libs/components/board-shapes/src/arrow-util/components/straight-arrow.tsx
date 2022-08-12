import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import type {
    Decoration,
    ShapeStyles,
} from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';
import {
    getStraightArrowHeadPoints,
    renderFreehandArrowShaft,
} from '../arrow-helpers';
import { Arrowhead } from './arrow-head';

interface ArrowSvgProps {
    id: string;
    style: ShapeStyles;
    start: number[];
    bend: number[];
    end: number[];
    arrowBend: number;
    decorationStart: Decoration | undefined;
    decorationEnd: Decoration | undefined;
    isDarkMode: boolean;
    isDraw: boolean;
}

export const StraightArrow = React.memo(function StraightArrow({
    id,
    style,
    start,
    end,
    decorationStart,
    decorationEnd,
    isDraw,
    isDarkMode,
}: ArrowSvgProps) {
    const arrowDist = Vec.dist(start, end);
    if (arrowDist < 2) return null;
    const styles = getShapeStyle(style, isDarkMode);
    const { strokeWidth } = styles;
    const sw = 1 + strokeWidth * 1.618;
    // Path between start and end points
    const path = isDraw
        ? renderFreehandArrowShaft(
              id,
              style,
              start,
              end,
              decorationStart,
              decorationEnd
          )
        : 'M' + Vec.toFixed(start) + 'L' + Vec.toFixed(end);
    const { strokeDasharray, strokeDashoffset } = Utils.getPerfectDashProps(
        arrowDist,
        strokeWidth * 1.618,
        style.dash,
        2,
        false
    );
    // Arrowheads
    const arrowHeadLength = Math.min(arrowDist / 3, strokeWidth * 8);
    const startArrowHead = decorationStart
        ? getStraightArrowHeadPoints(start, end, arrowHeadLength)
        : null;
    const endArrowHead = decorationEnd
        ? getStraightArrowHeadPoints(end, start, arrowHeadLength)
        : null;
    return (
        <>
            <path className="tl-stroke-hitarea" d={path} />
            <path
                d={path}
                fill={styles.stroke}
                stroke={styles.stroke}
                strokeWidth={isDraw ? sw / 2 : sw}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
            />
            {startArrowHead && (
                <Arrowhead
                    left={startArrowHead.left}
                    middle={start}
                    right={startArrowHead.right}
                    stroke={styles.stroke}
                    strokeWidth={sw}
                />
            )}
            {endArrowHead && (
                <Arrowhead
                    left={endArrowHead.left}
                    middle={end}
                    right={endArrowHead.right}
                    stroke={styles.stroke}
                    strokeWidth={sw}
                />
            )}
        </>
    );
});
