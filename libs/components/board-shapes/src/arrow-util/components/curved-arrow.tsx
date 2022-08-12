import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import type {
    Decoration,
    ShapeStyles,
} from '@toeverything/components/board-types';
import { EASINGS } from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';
import {
    getArcLength,
    getArrowArcPath,
    getCtp,
    getCurvedArrowHeadPoints,
    renderCurvedFreehandArrowShaft,
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

export const CurvedArrow = React.memo(function CurvedArrow({
    id,
    style,
    start,
    bend,
    end,
    arrowBend,
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
    // Calculate a path as a segment of a circle passing through the three points start, bend, and end
    const circle = getCtp(start, bend, end);
    const center = [circle[0], circle[1]];
    const radius = circle[2];
    const length = getArcLength(center, radius, start, end);
    const getRandom = Utils.rng(id);
    const easing =
        EASINGS[getRandom() > 0 ? 'easeInOutSine' : 'easeInOutCubic'];
    const path = isDraw
        ? renderCurvedFreehandArrowShaft(
              id,
              style,
              start,
              end,
              decorationStart,
              decorationEnd,
              center,
              radius,
              length,
              easing
          )
        : getArrowArcPath(start, end, circle, arrowBend);
    const { strokeDasharray, strokeDashoffset } = Utils.getPerfectDashProps(
        Math.abs(length),
        sw,
        style.dash,
        2,
        false
    );
    // Arrowheads
    const arrowHeadLength = Math.min(arrowDist / 3, strokeWidth * 8);
    const startArrowHead = decorationStart
        ? getCurvedArrowHeadPoints(
              start,
              arrowHeadLength,
              center,
              radius,
              length < 0
          )
        : null;
    const endArrowHead = decorationEnd
        ? getCurvedArrowHeadPoints(
              end,
              arrowHeadLength,
              center,
              radius,
              length >= 0
          )
        : null;
    return (
        <>
            <path className="tl-stroke-hitarea" d={path} />
            <path
                d={path}
                fill={isDraw ? styles.stroke : 'none'}
                stroke={styles.stroke}
                strokeWidth={isDraw ? 0 : sw}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
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
