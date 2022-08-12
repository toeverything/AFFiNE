import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import { getTrianglePoints } from '../triangle-helpers';

interface TriangleBindingIndicatorProps {
    size: number[];
}

export function TriangleBindingIndicator({
    size,
}: TriangleBindingIndicatorProps) {
    const trianglePoints = getTrianglePoints(size).join();
    return (
        <polygon
            className="tl-binding-indicator"
            points={trianglePoints}
            strokeWidth={BINDING_DISTANCE * 2}
        />
    );
}
