import type { TLBounds } from '@tldraw/core';

interface WithLabelMaskProps {
    id: string;
    bounds: TLBounds;
    labelSize: number[];
    offset?: number[];
    scale?: number;
}

export function LabelMask({
    id,
    bounds,
    labelSize,
    offset,
    scale = 1,
}: WithLabelMaskProps) {
    return (
        <defs>
            <mask id={id + '_clip'}>
                <rect
                    x={-100}
                    y={-100}
                    width={bounds.width + 200}
                    height={bounds.height + 200}
                    fill="white"
                />
                <rect
                    x={
                        bounds.width / 2 -
                        (labelSize[0] / 2) * scale +
                        (offset?.[0] || 0)
                    }
                    y={
                        bounds.height / 2 -
                        (labelSize[1] / 2) * scale +
                        (offset?.[1] || 0)
                    }
                    width={labelSize[0] * scale}
                    height={labelSize[1] * scale}
                    rx={4 * scale}
                    ry={4 * scale}
                    fill="black"
                    opacity={Math.max(scale, 0.8)}
                />
            </mask>
        </defs>
    );
}
