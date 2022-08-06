import * as React from 'react';
import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import type { ShapeStyles } from '@toeverything/components/board-types';
import { getShapeStyle } from '../../shared';

interface RectangleSvgProps {
    id: string;
    style: ShapeStyles;
    isSelected: boolean;
    size: number[];
    isDarkMode: boolean;
}

export const Frame = React.memo(function DashedRectangle({
    id,
    style,
    size,
    isSelected,
    isDarkMode,
}: RectangleSvgProps) {
    const { strokeWidth, fill } = getShapeStyle(style, isDarkMode);

    const _fill = fill && fill !== 'none' ? fill : '#F7F9FF';

    const sw = 1 + strokeWidth * 1.618;

    const w = Math.max(0, size[0] - sw / 2);
    const h = Math.max(0, size[1] - sw / 2);

    return (
        <>
            <rect
                className={
                    isSelected || style.isFilled
                        ? 'tl-fill-hitarea'
                        : 'tl-stroke-hitarea'
                }
                x={sw / 2}
                y={sw / 2}
                width={w}
                height={h}
                strokeWidth={BINDING_DISTANCE}
            />
            <rect
                x={sw / 2}
                y={sw / 2}
                width={w}
                height={h}
                fill={_fill}
                pointerEvents="none"
            />
        </>
    );
});
