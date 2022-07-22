import * as React from 'react';
import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import { getPentagramPoints } from '../pentagram-helpers';

interface TriangleBindingIndicatorProps {
    size: number[];
}

export function PentagramBindingIndicator({
    size,
}: TriangleBindingIndicatorProps) {
    const trianglePoints = getPentagramPoints(size).join();
    return (
        <polygon
            className="tl-binding-indicator"
            points={trianglePoints}
            strokeWidth={BINDING_DISTANCE * 2}
        />
    );
}
