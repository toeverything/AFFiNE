import * as React from 'react';
import { Utils, SVGContainer } from '@tldraw/core';
import {
    RectangleShape,
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
import { TextLabel } from '../shared/text-label';
import { getRectangleIndicatorPathTDSnapshot } from './rectangle-helpers';
import { DrawRectangle } from './components/DrawRectangle';
import { DashedRectangle } from './components/DashedRectangle';
import { BindingIndicator } from './components/BindingIndicator';
import { styled } from '@toeverything/components/ui';

type T = RectangleShape;
type E = HTMLDivElement;

export class RectangleUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Rectangle as const;

    override canBind = true;

    override canClone = true;

    override canEdit = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'id',
                type: TDShapeType.Rectangle,
                name: 'Rectangle',
                parentId: 'page',
                childIndex: 1,
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
            const {
                id,
                size,
                style,
                label = '',
                labelPoint = LABEL_POINT,
            } = shape;
            const font = getFontStyle(style);
            const styles = getShapeStyle(style, meta.isDarkMode);
            const Component =
                style.dash === DashStyle.Draw ? DrawRectangle : DashedRectangle;
            const handleLabelChange = React.useCallback(
                (label: string) => onShapeChange?.({ id, label }),
                [onShapeChange]
            );
            return (
                <FullWrapper ref={ref} {...events}>
                    <TextLabel
                        isEditing={isEditing}
                        onChange={handleLabelChange}
                        onBlur={onShapeBlur}
                        font={font}
                        text={label}
                        color={styles.stroke}
                        offsetX={(labelPoint[0] - 0.5) * bounds.width}
                        offsetY={(labelPoint[1] - 0.5) * bounds.height}
                    />
                    <SVGContainer
                        id={shape.id + '_svg'}
                        opacity={isGhost ? GHOSTED_OPACITY : 1}
                    >
                        {isBinding && (
                            <BindingIndicator
                                strokeWidth={styles.strokeWidth}
                                size={size}
                            />
                        )}
                        <Component
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

        if (style.dash === DashStyle.Draw) {
            return (
                <path
                    d={getRectangleIndicatorPathTDSnapshot(id, style, size)}
                />
            );
        }

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

const FullWrapper = styled('div')({ width: '100%', height: '100%' });
