import * as React from 'react';
import { getShapeStyle } from '../../shared';
import type { ShapeStyles } from '@toeverything/components/board-types';
import {
    getHexagonIndicatorPathTDSnapshot,
    getHexagonPath,
} from '../hexagon-helpers';

interface HexagonSvgProps {
    id: string;
    size: number[];
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
}

export const DrawHexagon = React.memo(function DrawTriangle({
    id,
    size,
    style,
    isSelected,
    isDarkMode,
}: HexagonSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const path_td_snapshot = getHexagonPath(id, size, style);
    const indicatorPath = getHexagonIndicatorPathTDSnapshot(id, size, style);
    return (
        <>
            <path
                className={
                    style.isFilled || isSelected
                        ? 'tl-fill-hitarea'
                        : 'tl-stroke-hitarea'
                }
                d={indicatorPath}
            />
            {style.isFilled && (
                <path d={indicatorPath} fill={fill} pointerEvents="none" />
            )}
            <path
                d={path_td_snapshot}
                fill={stroke}
                stroke={stroke}
                strokeWidth={strokeWidth}
                pointerEvents="none"
            />
        </>
    );
});
