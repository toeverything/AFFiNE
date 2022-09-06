import { Utils } from '@tldraw/core';
import {
    BINDING_DISTANCE,
    ShapeStyles,
} from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';

interface RectangleSvgProps {
    id: string;
    style: ShapeStyles;
    isSelected: boolean;
    size: number[];
    isDarkMode: boolean;
}

export const DashedRectangle = React.memo(function DashedRectangle({
    id,
    style,
    size,
    isSelected,
    isDarkMode,
}: RectangleSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);

    const sw = 1 + strokeWidth * 1.618;

    const w = Math.max(0, size[0] - sw / 2);
    const h = Math.max(0, size[1] - sw / 2);

    const strokes: [number[], number[], number][] = [
        [[sw / 2, sw / 2], [w, sw / 2], w - sw / 2],
        [[w, sw / 2], [w, h], h - sw / 2],
        [[w, h], [sw / 2, h], w - sw / 2],
        [[sw / 2, h], [sw / 2, sw / 2], h - sw / 2],
    ];

    const paths = strokes.map(([start, end, length], i) => {
        const { strokeDasharray, strokeDashoffset } = Utils.getPerfectDashProps(
            length,
            strokeWidth * 1.618,
            style.dash
        );

        return (
            <line
                key={id + '_' + i}
                x1={start[0]}
                y1={start[1]}
                x2={end[0]}
                y2={end[1]}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
            />
        );
    });

    return (
        <>
            <rect
                className={'tl-fill-hitarea'}
                x={sw / 2}
                y={sw / 2}
                width={w}
                height={h}
                opacity={1}
                strokeWidth={BINDING_DISTANCE}
            />
            {style.isFilled && (
                <rect
                    x={sw / 2}
                    y={sw / 2}
                    width={w - sw / 2}
                    height={h - sw / 2}
                    fill={fill}
                    pointerEvents="none"
                />
            )}
            <g
                pointerEvents="none"
                stroke={stroke}
                strokeWidth={sw}
                strokeLinecap="round"
            >
                {paths}
            </g>
        </>
    );
});
