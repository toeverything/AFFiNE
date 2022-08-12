import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import { getHexagonPoints } from '../hexagon-helpers';

interface TriangleBindingIndicatorProps {
    size: number[];
}

export function HexagonBindingIndicator({
    size,
}: TriangleBindingIndicatorProps) {
    const trianglePoints = getHexagonPoints(size).join();
    return (
        <polygon
            className="tl-binding-indicator"
            points={trianglePoints}
            strokeWidth={BINDING_DISTANCE * 2}
        />
    );
}
