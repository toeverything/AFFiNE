import { BINDING_DISTANCE } from '@toeverything/components/board-types';

interface BindingIndicatorProps {
    strokeWidth: number;
    size: number[];
}
export function BindingIndicator({ strokeWidth, size }: BindingIndicatorProps) {
    return (
        <rect
            className="tl-binding-indicator"
            x={strokeWidth}
            y={strokeWidth}
            width={Math.max(0, size[0] - strokeWidth / 2)}
            height={Math.max(0, size[1] - strokeWidth / 2)}
            strokeWidth={BINDING_DISTANCE * 2}
        />
    );
}
