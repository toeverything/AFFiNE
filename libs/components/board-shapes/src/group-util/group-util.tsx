import * as React from 'react';
import { styled } from '@toeverything/components/ui';
import { Utils, SVGContainer } from '@tldraw/core';
import { defaultStyle } from '../shared/shape-styles';
import {
    TDShapeType,
    GroupShape,
    TDMeta,
    GHOSTED_OPACITY,
} from '@toeverything/components/board-types';
import { TDShapeUtil } from '../TDShapeUtil';
import { getBoundsRectangle, commonColors } from '../shared';

type T = GroupShape;
type E = SVGSVGElement;

export class GroupUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Group as const;

    override canBind = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'id',
                type: TDShapeType.Group,
                name: 'Group',
                parentId: 'page',
                childIndex: 1,
                point: [0, 0],
                size: [100, 100],
                rotation: 0,
                children: [],
                style: defaultStyle,
                workspace: props.workspace,
            },
            props
        );
    };

    Component = TDShapeUtil.Component<T, E, TDMeta>(
        ({ shape, isBinding, isGhost, isHovered, isSelected, events }, ref) => {
            const { id, size } = shape;

            const sw = 2;
            const w = Math.max(0, size[0] - sw / 2);
            const h = Math.max(0, size[1] - sw / 2);

            const strokes: [number[], number[], number][] = [
                [[sw / 2, sw / 2], [w, sw / 2], w - sw / 2],
                [[w, sw / 2], [w, h], h - sw / 2],
                [[w, h], [sw / 2, h], w - sw / 2],
                [[sw / 2, h], [sw / 2, sw / 2], h - sw / 2],
            ];

            const paths = strokes.map(([start, end], i) => {
                return (
                    <line
                        key={id + '_' + i}
                        x1={start[0]}
                        y1={start[1]}
                        x2={end[0]}
                        y2={end[1]}
                    />
                );
            });

            return (
                <SVGContainer ref={ref} {...events}>
                    {isBinding && (
                        <rect
                            className="tl-binding-indicator"
                            strokeWidth={this.bindingDistance}
                        />
                    )}
                    <g opacity={isGhost ? GHOSTED_OPACITY : 1}>
                        <rect
                            x={0}
                            y={0}
                            width={size[0]}
                            height={size[1]}
                            fill="transparent"
                            pointerEvents="all"
                        />
                        <ScaledLines
                            stroke={commonColors.black}
                            opacity={isHovered || isSelected ? 1 : 0}
                            strokeLinecap="round"
                            pointerEvents="stroke"
                        >
                            {paths}
                        </ScaledLines>
                    </g>
                </SVGContainer>
            );
        }
    );

    Indicator = TDShapeUtil.Indicator<T>(({ shape }) => {
        const { id, size } = shape;

        const sw = 2;
        const w = Math.max(0, size[0] - sw / 2);
        const h = Math.max(0, size[1] - sw / 2);

        const strokes: [number[], number[], number][] = [
            [[sw / 2, sw / 2], [w, sw / 2], w - sw / 2],
            [[w, sw / 2], [w, h], h - sw / 2],
            [[w, h], [sw / 2, h], w - sw / 2],
            [[sw / 2, h], [sw / 2, sw / 2], h - sw / 2],
        ];

        const paths = strokes.map(([start, end], i) => {
            return (
                <line
                    key={id + '_' + i}
                    x1={start[0]}
                    y1={start[1]}
                    x2={end[0]}
                    y2={end[1]}
                />
            );
        });

        return (
            <ScaledLines strokeLinecap="round" pointerEvents="stroke">
                {paths}
            </ScaledLines>
        );
    });

    getBounds = (shape: T) => {
        return getBoundsRectangle(shape, this.boundsCache);
    };

    override shouldRender = (prev: T, next: T) => {
        return next.size !== prev.size || next.style !== prev.style;
    };
}

const ScaledLines = styled('g')({
    strokeWidth: 'calc(1.5px * var(--tl-scale))',
    strokeDasharray: `calc(1px * var(--tl-scale)), calc(3px * var(--tl-scale))`,
});
