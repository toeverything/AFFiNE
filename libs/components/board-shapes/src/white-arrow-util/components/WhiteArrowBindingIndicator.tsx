import * as React from 'react';
import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import { getWhiteArrowPoints } from '../white-arrow-helpers';

interface TriangleBindingIndicatorProps {
    size: number[];
}

export function WhiteArrowBindingIndicator({
    size,
}: TriangleBindingIndicatorProps) {
    const trianglePoints = getWhiteArrowPoints(size).join();
    return (
        <polygon
            className="tl-binding-indicator"
            points={trianglePoints}
            strokeWidth={BINDING_DISTANCE * 2}
        />
    );
}
