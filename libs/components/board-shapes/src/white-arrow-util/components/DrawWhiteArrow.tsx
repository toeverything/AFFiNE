import * as React from 'react';
import { getShapeStyle } from '../../shared';
import type { ShapeStyles } from '@toeverything/components/board-types';
import {
    getWhiteArrowIndicatorPathTDSnapshot,
    getWhiteArrowPath,
} from '../white-arrow-helpers';

interface WhiteArrowSvgProps {
    id: string;
    size: number[];
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
}

export const DrawWhiteArrow = React.memo(function DrawTriangle({
    id,
    size,
    style,
    isSelected,
    isDarkMode,
}: WhiteArrowSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const path_td_snapshot = getWhiteArrowPath(id, size, style);
    const indicatorPath = getWhiteArrowIndicatorPathTDSnapshot(id, size, style);
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
