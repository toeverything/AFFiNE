import { Utils } from '@tldraw/core';
import type { ShapeStyles } from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';

interface EllipseSvgProps {
    radius: number[];
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
}

export const DashedEllipse = React.memo(function DashedEllipse({
    radius,
    style,
    isSelected,
    isDarkMode,
}: EllipseSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const sw = 1 + strokeWidth * 1.618;
    const rx = Math.max(0, radius[0] - sw / 2);
    const ry = Math.max(0, radius[1] - sw / 2);
    const perimeter = Utils.perimeterOfEllipse(rx, ry);
    const { strokeDasharray, strokeDashoffset } = Utils.getPerfectDashProps(
        perimeter < 64 ? perimeter * 2 : perimeter,
        strokeWidth * 1.618,
        style.dash,
        4
    );

    return (
        <>
            <ellipse
                className={
                    style.isFilled || isSelected
                        ? 'tl-fill-hitarea'
                        : 'tl-stroke-hitarea'
                }
                cx={radius[0]}
                cy={radius[1]}
                rx={radius[0]}
                ry={radius[1]}
            />
            <ellipse
                cx={radius[0]}
                cy={radius[1]}
                rx={rx}
                ry={ry}
                fill={fill}
                stroke={stroke}
                strokeWidth={sw}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                pointerEvents="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
});
