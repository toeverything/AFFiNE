import type { ShapeStyles } from '@toeverything/components/board-types';
import * as React from 'react';
import { getShapeStyle } from '../../shared';
import {
    getRectangleIndicatorPathTDSnapshot,
    getRectanglePath,
} from '../rectangle-helpers';

interface RectangleSvgProps {
    id: string;
    style: ShapeStyles;
    isSelected: boolean;
    isDarkMode: boolean;
    size: number[];
}

export const DrawRectangle = React.memo(function DrawRectangle({
    id,
    style,
    size,
    isSelected,
    isDarkMode,
}: RectangleSvgProps) {
    const { isFilled } = style;
    const { stroke, strokeWidth, fill } = getShapeStyle(style, isDarkMode);
    const path_td_snapshot = getRectanglePath(id, style, size);
    const innerPath = getRectangleIndicatorPathTDSnapshot(id, style, size);

    return (
        <>
            <path
                className={
                    style.isFilled || isSelected
                        ? 'tl-fill-hitarea'
                        : 'tl-stroke-hitarea'
                }
                d={innerPath}
            />
            {isFilled && (
                <path d={innerPath} fill={fill} pointerEvents="none" />
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
