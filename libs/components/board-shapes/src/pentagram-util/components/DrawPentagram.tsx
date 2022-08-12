import type { ShapeStyles } from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';
import {
    getPentagramIndicatorPathTDSnapshot,
    getPentagramPath,
} from '../pentagram-helpers';

interface PentagramSvgProps {
    id: string;
    size: number[];
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
}

export const DrawPentagram = React.memo(function DrawTriangle({
    id,
    size,
    style,
    isSelected,
    isDarkMode,
}: PentagramSvgProps) {
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const path_td_snapshot = getPentagramPath(id, size, style);
    const indicatorPath = getPentagramIndicatorPathTDSnapshot(id, size, style);
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
