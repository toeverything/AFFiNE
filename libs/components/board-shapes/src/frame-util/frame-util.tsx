import * as React from 'react';
import { Utils, SVGContainer } from '@tldraw/core';
import {
    FrameShape,
    DashStyle,
    TDShapeType,
    TDMeta,
    GHOSTED_OPACITY,
    LABEL_POINT,
} from '@toeverything/components/board-types';
import { TDShapeUtil } from '../TDShapeUtil';
import {
    defaultStyle,
    getShapeStyle,
    getBoundsRectangle,
    transformRectangle,
    getFontStyle,
    transformSingleRectangle,
} from '../shared';
import { DrawFrame } from './components/draw-frame';
import { styled } from '@toeverything/components/ui';

type T = FrameShape;
type E = HTMLDivElement;

export class FrameUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Frame as const;

    override canBind = true;

    override canClone = true;

    override canEdit = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'id',
                type: TDShapeType.Frame,
                name: 'Frame',
                parentId: 'page',
                childIndex: 0,
                point: [0, 0],
                size: [1, 1],
                rotation: 0,
                style: defaultStyle,
                label: '',
                labelPoint: [0.5, 0.5],
                workspace: props.workspace,
            },
            props
        );
    };

    Component = TDShapeUtil.Component<T, E, TDMeta>(
        (
            {
                shape,
                isEditing,
                isBinding,
                isSelected,
                isGhost,
                meta,
                bounds,
                events,
                onShapeBlur,
                onShapeChange,
            },
            ref
        ) => {
            const { id, size, style } = shape;
            return (
                <FullWrapper ref={ref} {...events}>
                    <SVGContainer
                        id={shape.id + '_svg'}
                        opacity={1}
                        fill={'#fff'}
                    >
                        <DrawFrame
                            id={id}
                            style={style}
                            size={size}
                            isSelected={isSelected}
                            isDarkMode={meta.isDarkMode}
                        />
                    </SVGContainer>
                </FullWrapper>
            );
        }
    );

    Indicator = TDShapeUtil.Indicator<T>(({ shape }) => {
        const { id, style, size } = shape;

        const styles = getShapeStyle(style, false);
        const sw = styles.strokeWidth;
        return (
            <rect
                x={sw}
                y={sw}
                rx={1}
                ry={1}
                width={Math.max(1, size[0] - sw * 2)}
                height={Math.max(1, size[1] - sw * 2)}
            />
        );
    });

    getBounds = (shape: T) => {
        return getBoundsRectangle(shape, this.boundsCache);
    };

    override shouldRender = (prev: T, next: T) => {
        return (
            next.size !== prev.size ||
            next.style !== prev.style ||
            next.label !== prev.label
        );
    };

    override transform = transformRectangle;

    override transformSingle = transformSingleRectangle;

    override hitTestPoint = (shape: T, point: number[]): boolean => {
        return false;
    };

    override hitTestLineSegment = (
        shape: T,
        A: number[],
        B: number[]
    ): boolean => {
        return false;
    };
}

const FullWrapper = styled('div')({
    width: '100%',
    height: '100%',
    '.tl-fill-hitarea': {
        fill: '#F7F9FF',
    },
    '.tl-stroke-hitarea': {
        fill: '#F7F9FF',
    },
});
