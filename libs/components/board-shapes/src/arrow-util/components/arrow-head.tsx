export interface ArrowheadProps {
    left: number[];
    middle: number[];
    right: number[];
    stroke: string;
    strokeWidth: number;
}

export function Arrowhead({
    left,
    middle,
    right,
    stroke,
    strokeWidth,
}: ArrowheadProps) {
    return (
        <g>
            <path
                className="tl-stroke-hitarea"
                d={`M ${left} L ${middle} ${right}`}
            />
            <path
                d={`M ${left} L ${middle} ${right}`}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
            />
        </g>
    );
}
