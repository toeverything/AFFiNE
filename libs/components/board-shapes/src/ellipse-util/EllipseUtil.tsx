import * as React from 'react';
import { Utils, SVGContainer, TLBounds } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import {
    defaultStyle,
    getShapeStyle,
    getFontStyle,
    TextLabel,
} from '../shared';
import {
    EllipseShape,
    DashStyle,
    TDShapeType,
    TDShape,
    TransformInfo,
    TDMeta,
    GHOSTED_OPACITY,
    LABEL_POINT,
} from '@toeverything/components/board-types';
import { TDShapeUtil } from '../TDShapeUtil';
import {
    intersectEllipseBounds,
    intersectLineSegmentEllipse,
    intersectRayEllipse,
} from '@tldraw/intersect';
import { getEllipseIndicatorPath } from './ellipse-helpers';
import { DrawEllipse } from './components/DrawEllipse';
import { DashedEllipse } from './components/DashedEllipse';
import { styled } from '@toeverything/components/ui';

type T = EllipseShape;
type E = HTMLDivElement;
type M = TDMeta;

export class EllipseUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Ellipse as const;

    override canBind = true;

    override canClone = true;

    override canEdit = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'id',
                type: TDShapeType.Ellipse,
                name: 'Ellipse',
                parentId: 'page',
                childIndex: 1,
                point: [0, 0],
                radius: [1, 1],
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
                isGhost,
                isSelected,
                isBinding,
                isEditing,
                meta,
                bounds,
                events,
                onShapeChange,
                onShapeBlur,
            },
            ref
        ) => {
            const {
                id,
                radius,
                style,
                label = '',
                labelPoint = LABEL_POINT,
            } = shape;
            const font = getFontStyle(shape.style);
            const styles = getShapeStyle(style, meta.isDarkMode);
            const strokeWidth = styles.strokeWidth;
            const sw = 1 + strokeWidth * 1.618;
            const rx = Math.max(0, radius[0] - sw / 2);
            const ry = Math.max(0, radius[1] - sw / 2);
            const Component =
                style.dash === DashStyle.Draw ? DrawEllipse : DashedEllipse;
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
                            <ellipse
                                className="tl-binding-indicator"
                                cx={radius[0]}
                                cy={radius[1]}
                                rx={rx}
                                ry={ry}
                                strokeWidth={this.bindingDistance}
                            />
                        )}
                        <Component
                            id={id}
                            radius={radius}
                            style={style}
                            isSelected={isSelected}
                            isDarkMode={meta.isDarkMode}
                        />
                    </SVGContainer>
                </FullWrapper>
            );
        }
    );

    Indicator = TDShapeUtil.Indicator<T, M>(({ shape }) => {
        const { id, radius, style } = shape;
        const styles = getShapeStyle(style);
        const strokeWidth = styles.strokeWidth;
        const sw = 1 + strokeWidth * 1.618;
        const rx = Math.max(0, radius[0] - sw / 2);
        const ry = Math.max(0, radius[1] - sw / 2);
        return style.dash === DashStyle.Draw ? (
            <path d={getEllipseIndicatorPath(id, radius, style)} />
        ) : (
            <ellipse cx={radius[0]} cy={radius[1]} rx={rx} ry={ry} />
        );
    });

    override hitTestPoint = (shape: T, point: number[]): boolean => {
        return (
            Utils.pointInBounds(point, this.getRotatedBounds(shape)) &&
            Utils.pointInEllipse(
                point,
                this.getCenter(shape),
                shape.radius[0],
                shape.radius[1],
                shape.rotation || 0
            )
        );
    };

    override hitTestLineSegment = (
        shape: T,
        A: number[],
        B: number[]
    ): boolean => {
        return intersectLineSegmentEllipse(
            A,
            B,
            this.getCenter(shape),
            shape.radius[0],
            shape.radius[1],
            shape.rotation || 0
        ).didIntersect;
    };

    getBounds = (shape: T) => {
        return Utils.getFromCache(this.boundsCache, shape, () => {
            return Utils.getRotatedEllipseBounds(
                shape.point[0],
                shape.point[1],
                shape.radius[0],
                shape.radius[1],
                0
            );
        });
    };

    override getRotatedBounds = (shape: T): TLBounds => {
        return Utils.getRotatedEllipseBounds(
            shape.point[0],
            shape.point[1],
            shape.radius[0],
            shape.radius[1],
            shape.rotation
        );
    };

    override hitTestBounds = (shape: T, bounds: TLBounds): boolean => {
        const shapeBounds = this.getBounds(shape);

        return (
            Utils.boundsContained(shapeBounds, bounds) ||
            intersectEllipseBounds(
                this.getCenter(shape),
                shape.radius[0],
                shape.radius[1],
                shape.rotation || 0,
                bounds
            ).length > 0
        );
    };

    override shouldRender = (prev: T, next: T): boolean => {
        return (
            next.radius !== prev.radius ||
            next.style !== prev.style ||
            next.label !== prev.label
        );
    };

    override getCenter = (shape: T): number[] => {
        return Vec.add(shape.point, shape.radius);
    };

    override getBindingPoint = <K extends TDShape>(
        shape: T,
        fromShape: K,
        point: number[],
        origin: number[],
        direction: number[],
        bindAnywhere: boolean
    ) => {
        const expandedBounds = this.getExpandedBounds(shape);
        const center = this.getCenter(shape);
        let bindingPoint: number[];
        let distance: number;
        if (
            !Utils.pointInEllipse(
                point,
                center,
                shape.radius[0] + this.bindingDistance,
                shape.radius[1] + this.bindingDistance
            )
        ) {
            return;
        }
        if (bindAnywhere) {
            if (Vec.dist(point, this.getCenter(shape)) < 12) {
                bindingPoint = [0.5, 0.5];
            } else {
                bindingPoint = Vec.divV(
                    Vec.sub(point, [expandedBounds.minX, expandedBounds.minY]),
                    [expandedBounds.width, expandedBounds.height]
                );
            }
            distance = 0;
        } else {
            let intersection = intersectRayEllipse(
                origin,
                direction,
                center,
                shape.radius[0],
                shape.radius[1],
                shape.rotation || 0
            ).points.sort(
                (a, b) => Vec.dist(a, origin) - Vec.dist(b, origin)
            )[0];
            if (!intersection) {
                intersection = intersectLineSegmentEllipse(
                    point,
                    center,
                    center,
                    shape.radius[0],
                    shape.radius[1],
                    shape.rotation || 0
                ).points.sort(
                    (a, b) => Vec.dist(a, point) - Vec.dist(b, point)
                )[0];
            }
            if (!intersection) {
                return undefined;
            }
            // The anchor is a point between the handle and the intersection
            const anchor = Vec.med(point, intersection);
            if (
                Vec.distanceToLineSegment(
                    point,
                    anchor,
                    this.getCenter(shape)
                ) < 12
            ) {
                // If we're close to the center, snap to the center
                bindingPoint = [0.5, 0.5];
            } else {
                // Or else calculate a normalized point
                bindingPoint = Vec.divV(
                    Vec.sub(anchor, [expandedBounds.minX, expandedBounds.minY]),
                    [expandedBounds.width, expandedBounds.height]
                );
            }
            if (
                Utils.pointInEllipse(
                    point,
                    center,
                    shape.radius[0],
                    shape.radius[1],
                    shape.rotation || 0
                )
            ) {
                // Pad the arrow out by 16 points
                distance = this.bindingDistance / 2;
            } else {
                // Find the distance between the point and the ellipse
                const innerIntersection = intersectLineSegmentEllipse(
                    point,
                    center,
                    center,
                    shape.radius[0],
                    shape.radius[1],
                    shape.rotation || 0
                ).points[0];
                if (!innerIntersection) return undefined;
                distance = Math.max(
                    this.bindingDistance / 2,
                    Vec.dist(point, innerIntersection)
                );
            }
        }
        return {
            point: bindingPoint,
            distance,
        };
    };

    override transform = (
        shape: T,
        bounds: TLBounds,
        { scaleX, scaleY, initialShape }: TransformInfo<T>
    ): Partial<T> => {
        const { rotation = 0 } = initialShape;
        return {
            point: [bounds.minX, bounds.minY],
            radius: [bounds.width / 2, bounds.height / 2],
            rotation:
                (scaleX < 0 && scaleY >= 0) || (scaleY < 0 && scaleX >= 0)
                    ? -(rotation || 0)
                    : rotation || 0,
        };
    };

    override transformSingle = (shape: T, bounds: TLBounds): Partial<T> => {
        return {
            point: Vec.toFixed([bounds.minX, bounds.minY]),
            radius: Vec.div([bounds.width, bounds.height], 2),
        };
    };
}

const FullWrapper = styled('div')({ width: '100%', height: '100%' });
