/* eslint-disable no-restricted-syntax */
import { SVGContainer, Utils } from '@tldraw/core';
import {
    FrameShape,
    TDMeta,
    TDShapeType,
} from '@toeverything/components/board-types';
import { styled } from '@toeverything/components/ui';
import {
    defaultStyle,
    getBoundsRectangle,
    getShapeStyle,
    transformRectangle,
    transformSingleRectangle,
} from '../shared';
import { TDShapeUtil } from '../TDShapeUtil';
import { Frame } from './components/Frame';

type T = FrameShape;
type E = SVGSVGElement;

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
                isSelected,
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
                <SVGContainer
                    ref={ref}
                    {...events}
                    id={shape.id + '_svg'}
                    opacity={1}
                >
                    <Frame
                        id={id}
                        style={style}
                        size={size}
                        isSelected={isSelected}
                        isDarkMode={meta.isDarkMode}
                    />
                </SVGContainer>
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
}

const FullWrapper = styled('div')({
    width: '100%',
    height: '100%',
});
