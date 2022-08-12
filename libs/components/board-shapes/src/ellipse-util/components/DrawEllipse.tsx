import type { ShapeStyles } from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';
import { getEllipseIndicatorPath, getEllipsePath } from '../ellipse-helpers';

interface EllipseSvgProps {
    id: string;
    radius: number[];
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
}

export const DrawEllipse = React.memo(function DrawEllipse({
    id,
    radius,
    style,
    isSelected,
    isDarkMode,
}: EllipseSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const innerPath = getEllipsePath(id, radius, style);

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
            {style.isFilled && (
                <path
                    d={getEllipseIndicatorPath(id, radius, style)}
                    stroke="none"
                    fill={fill}
                    pointerEvents="none"
                />
            )}
            <path
                d={innerPath}
                fill={stroke}
                stroke={stroke}
                strokeWidth={strokeWidth}
                pointerEvents="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
});
