import * as React from 'react';
import { Utils, SVGContainer, TLBounds } from '@tldraw/core';
import {
    TriangleShape,
    TDShapeType,
    TDMeta,
    TDShape,
    DashStyle,
    BINDING_DISTANCE,
    GHOSTED_OPACITY,
    LABEL_POINT,
} from '@toeverything/components/board-types';
import { TDShapeUtil } from '../TDShapeUtil';
import {
    defaultStyle,
    getBoundsRectangle,
    transformRectangle,
    transformSingleRectangle,
    getFontStyle,
    TextLabel,
    getShapeStyle,
} from '../shared';
import {
    intersectBoundsPolygon,
    intersectLineSegmentPolyline,
    intersectRayLineSegment,
} from '@tldraw/intersect';
import Vec from '@tldraw/vec';
import { getTriangleCentroid, getTrianglePoints } from './triangle-helpers';
import { styled } from '@toeverything/components/ui';
import { DrawTriangle } from './components/DrawTriangle';
import { DashedTriangle } from './components/DashedTriangle';
import { TriangleBindingIndicator } from './components/TriangleBindingIndicator';

type T = TriangleShape;
type E = HTMLDivElement;

export class TriangleUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Triangle as const;

    override canBind = true;

    override canClone = true;

    override canEdit = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'id',
                type: TDShapeType.Triangle,
                name: 'Triangle',
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
                bounds,
                isBinding,
                isEditing,
                isSelected,
                isGhost,
                meta,
                events,
                onShapeChange,
                onShapeBlur,
            },
            ref
        ) => {
            const {
                id,
                label = '',
                size,
                style,
                labelPoint = LABEL_POINT,
            } = shape;
            const font = getFontStyle(style);
            const styles = getShapeStyle(style, meta.isDarkMode);
            const Component =
                style.dash === DashStyle.Draw ? DrawTriangle : DashedTriangle;
            const handleLabelChange = React.useCallback(
                (label: string) => onShapeChange?.({ id, label }),
                [onShapeChange]
            );
            const offsetY = React.useMemo(() => {
                const center = Vec.div(size, 2);
                const centroid = getTriangleCentroid(size);
                return (centroid[1] - center[1]) * 0.72;
            }, [size]);
            return (
                <FullWrapper ref={ref} {...events}>
                    <TextLabel
                        font={font}
                        text={label}
                        color={styles.stroke}
                        offsetX={(labelPoint[0] - 0.5) * bounds.width}
                        offsetY={
                            offsetY + (labelPoint[1] - 0.5) * bounds.height
                        }
                        isEditing={isEditing}
                        onChange={handleLabelChange}
                        onBlur={onShapeBlur}
                    />
                    <SVGContainer
                        id={shape.id + '_svg'}
                        opacity={isGhost ? GHOSTED_OPACITY : 1}
                    >
                        {isBinding && <TriangleBindingIndicator size={size} />}
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
        const { size } = shape;
        return <polygon points={getTrianglePoints(size).join()} />;
    });

    private get_points(shape: T) {
        const {
            rotation = 0,
            point: [x, y],
            size: [w, h],
        } = shape;
        return [
            [x + w / 2, y],
            [x, y + h],
            [x + w, y + h],
        ].map(pt => Vec.rotWith(pt, this.getCenter(shape), rotation));
    }

    override shouldRender = (prev: T, next: T) => {
        return (
            next.size !== prev.size ||
            next.style !== prev.style ||
            next.label !== prev.label
        );
    };

    getBounds = (shape: T) => {
        return getBoundsRectangle(shape, this.boundsCache);
    };

    override getExpandedBounds = (shape: T) => {
        return Utils.getBoundsFromPoints(
            getTrianglePoints(shape.size, this.bindingDistance).map(pt =>
                Vec.add(pt, shape.point)
            )
        );
    };

    override hitTestLineSegment = (
        shape: T,
        A: number[],
        B: number[]
    ): boolean => {
        return intersectLineSegmentPolyline(A, B, this.get_points(shape))
            .didIntersect;
    };

    override hitTestBounds = (shape: T, bounds: TLBounds): boolean => {
        return (
            Utils.boundsContained(this.getBounds(shape), bounds) ||
            intersectBoundsPolygon(bounds, this.get_points(shape)).length > 0
        );
    };

    override getBindingPoint = <K extends TDShape>(
        shape: T,
        fromShape: K,
        point: number[],
        origin: number[],
        direction: number[],
        bindAnywhere: boolean
    ) => {
        // Algorithm time! We need to find the binding point (a normalized point inside of the shape, or around the shape, where the arrow will point to) and the distance from the binding shape to the anchor.

        const expandedBounds = this.getExpandedBounds(shape);

        if (!Utils.pointInBounds(point, expandedBounds)) return;

        const points = getTrianglePoints(shape.size).map(pt =>
            Vec.add(pt, shape.point)
        );

        const expandedPoints = getTrianglePoints(
            shape.size,
            this.bindingDistance
        ).map(pt => Vec.add(pt, shape.point));

        const closestDistanceToEdge = Utils.pointsToLineSegments(points, true)
            .map(([a, b]) => Vec.distanceToLineSegment(a, b, point))
            .sort((a, b) => a - b)[0];

        if (
            !(
                Utils.pointInPolygon(point, expandedPoints) ||
                closestDistanceToEdge < this.bindingDistance
            )
        )
            return;

        const intersections = Utils.pointsToLineSegments(
            expandedPoints.concat([expandedPoints[0]])
        )
            .map(segment =>
                intersectRayLineSegment(
                    origin,
                    direction,
                    segment[0],
                    segment[1]
                )
            )
            .filter(intersection => intersection.didIntersect)
            .flatMap(intersection => intersection.points);

        if (!intersections.length) return;

        // The center of the triangle
        const center = Vec.add(getTriangleCentroid(shape.size), shape.point);

        // Find furthest intersection between ray from origin through point and expanded bounds. TODO: What if the shape has a curve? In that case, should we intersect the circle-from-three-points instead?
        const intersection = intersections.sort(
            (a, b) => Vec.dist(b, origin) - Vec.dist(a, origin)
        )[0];

        // The point between the handle and the intersection
        const middlePoint = Vec.med(point, intersection);

        let anchor: number[];
        let distance: number;

        if (bindAnywhere) {
            anchor =
                Vec.dist(point, center) < BINDING_DISTANCE / 2 ? center : point;
            distance = 0;
        } else {
            if (
                Vec.distanceToLineSegment(point, middlePoint, center) <
                BINDING_DISTANCE / 2
            ) {
                anchor = center;
            } else {
                anchor = middlePoint;
            }

            if (Utils.pointInPolygon(point, points)) {
                distance = this.bindingDistance;
            } else {
                distance = Math.max(
                    this.bindingDistance,
                    closestDistanceToEdge
                );
            }
        }

        const bindingPoint = Vec.divV(
            Vec.sub(anchor, [expandedBounds.minX, expandedBounds.minY]),
            [expandedBounds.width, expandedBounds.height]
        );

        return {
            point: Vec.clampV(bindingPoint, 0, 1),
            distance,
        };
    };

    override transform = transformRectangle;

    override transformSingle = transformSingleRectangle;
}

const FullWrapper = styled('div')({ width: '100%', height: '100%' });
