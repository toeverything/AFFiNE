/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Utils, TLShapeUtil } from '@tldraw/core';
import type { TLPointerInfo, TLBounds } from '@tldraw/core';
import {
    intersectLineSegmentBounds,
    intersectLineSegmentPolyline,
    intersectRayBounds,
} from '@tldraw/intersect';
import { Vec } from '@tldraw/vec';
import type {
    TDMeta,
    TDShape,
    TransformInfo,
} from '@toeverything/components/board-types';
import { BINDING_DISTANCE } from '@toeverything/components/board-types';
import { createRef } from 'react';
import { getTextSvgElement } from './shared/get-text-svg-element';
import { getTextLabelSize } from './shared/get-text-size';
import { getFontStyle, getShapeStyle } from './shared';

export abstract class TDShapeUtil<
    T extends TDShape,
    E extends Element = any
> extends TLShapeUtil<T, E, TDMeta> {
    abstract type: T['type'];

    canBind = false;

    canEdit = false;

    canClone = false;

    isAspectRatioLocked = false;

    hideResizeHandles = false;

    bindingDistance = BINDING_DISTANCE;

    abstract getShape: (props: Partial<T>) => T;

    hitTestPoint = (shape: T, point: number[]): boolean => {
        return Utils.pointInBounds(point, this.getRotatedBounds(shape));
    };

    hitTestLineSegment = (shape: T, A: number[], B: number[]): boolean => {
        const box = Utils.getBoundsFromPoints([A, B]);
        const bounds = this.getBounds(shape);

        return Utils.boundsContain(bounds, box) || shape.rotation
            ? intersectLineSegmentPolyline(
                  A,
                  B,
                  Utils.getRotatedCorners(this.getBounds(shape))
              ).didIntersect
            : intersectLineSegmentBounds(A, B, this.getBounds(shape)).length >
                  0;
    };

    create = (props: { id: string; workspace: string } & Partial<T>) => {
        this.refMap.set(props.id, createRef());
        return this.getShape(props);
    };

    getCenter = (shape: T) => {
        return Utils.getBoundsCenter(this.getBounds(shape));
    };

    getExpandedBounds = (shape: T) => {
        return Utils.expandBounds(this.getBounds(shape), this.bindingDistance);
    };

    getBindingPoint = <K extends TDShape>(
        shape: T,
        fromShape: K,
        point: number[],
        origin: number[],
        direction: number[],
        bindAnywhere: boolean
    ) => {
        // Algorithm time! We need to find the binding point (a normalized point inside of the shape, or around the shape, where the arrow will point to) and the distance from the binding shape to the anchor.

        const bounds = this.getBounds(shape);
        const expandedBounds = this.getExpandedBounds(shape);

        // The point must be inside of the expanded bounding box
        if (!Utils.pointInBounds(point, expandedBounds)) return;

        const intersections = intersectRayBounds(
            origin,
            direction,
            expandedBounds
        )
            .filter(int => int.didIntersect)
            .map(int => int.points[0]);

        if (!intersections.length) return;

        // The center of the shape
        const center = this.getCenter(shape);

        // Find furthest intersection between ray from origin through point and expanded bounds. TODO: What if the shape has a curve? In that case, should we intersect the circle-from-three-points instead?
        const intersection = intersections.sort(
            (a, b) => Vec.dist(b, origin) - Vec.dist(a, origin)
        )[0];

        // The point between the handle and the intersection
        const middlePoint = Vec.med(point, intersection);

        // The anchor is the point in the shape where the arrow will be pointing
        let anchor: number[];

        // The distance is the distance from the anchor to the handle
        let distance: number;

        if (bindAnywhere) {
            // If the user is indicating that they want to bind inside of the shape, we just use the handle's point
            anchor =
                Vec.dist(point, center) < BINDING_DISTANCE / 2 ? center : point;
            distance = 0;
        } else {
            if (
                Vec.distanceToLineSegment(point, middlePoint, center) <
                BINDING_DISTANCE / 2
            ) {
                // If the line segment would pass near to the center, snap the anchor the center point
                anchor = center;
            } else {
                // Otherwise, the anchor is the middle point between the handle and the intersection
                anchor = middlePoint;
            }

            if (Utils.pointInBounds(point, bounds)) {
                // If the point is inside of the shape, use the shape's binding distance

                distance = this.bindingDistance;
            } else {
                // Otherwise, use the actual distance from the handle point to nearest edge
                distance = Math.max(
                    this.bindingDistance,
                    Utils.getBoundsSides(bounds)
                        .map(side =>
                            Vec.distanceToLineSegment(
                                side[1][0],
                                side[1][1],
                                point
                            )
                        )
                        .sort((a, b) => a - b)[0]
                );
            }
        }

        // The binding point is a normalized point indicating the position of the anchor.
        // An anchor at the middle of the shape would be (0.5, 0.5). When the shape's bounds
        // changes, we will re-recalculate the actual anchor point by multiplying the
        // normalized point by the shape's new bounds.
        const bindingPoint = Vec.divV(
            Vec.sub(anchor, [expandedBounds.minX, expandedBounds.minY]),
            [expandedBounds.width, expandedBounds.height]
        );

        return {
            point: Vec.clampV(bindingPoint, 0, 1),
            distance,
        };
    };

    mutate = (shape: T, props: Partial<T>): Partial<T> => {
        return props;
    };

    transform = (
        shape: T,
        bounds: TLBounds,
        info: TransformInfo<T>
    ): Partial<T> => {
        return { ...shape, point: [bounds.minX, bounds.minY] };
    };

    transformSingle = (
        shape: T,
        bounds: TLBounds,
        info: TransformInfo<T>
    ): Partial<T> | void => {
        return this.transform(shape, bounds, info);
    };

    updateChildren?: <K extends TDShape>(
        shape: T,
        children: K[]
    ) => Partial<K>[] | void;

    onChildrenChange?: (shape: T, children: TDShape[]) => Partial<T> | void;

    onHandleChange?: (
        shape: T,
        handles: Partial<T['handles']>
    ) => Partial<T> | void;

    onRightPointHandle?: (
        shape: T,
        handles: Partial<T['handles']>,
        info: Partial<TLPointerInfo>
    ) => Partial<T> | void;

    onDoubleClickHandle?: (
        shape: T,
        handles: Partial<T['handles']>,
        info: Partial<TLPointerInfo>
    ) => Partial<T> | void;

    onDoubleClickBoundsHandle?: (shape: T) => Partial<T> | void;

    onSessionComplete?: (shape: T) => Partial<T> | void;

    getSvgElement = (shape: T, isDarkMode: boolean): SVGElement | void => {
        const elm = document
            .getElementById(shape.id + '_svg')
            ?.cloneNode(true) as SVGElement;
        if (!elm) return; // possibly in test mode
        if ('label' in shape && (shape as any).label) {
            const s = shape as TDShape & { label: string };
            const g = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'g'
            );
            const bounds = this.getBounds(shape);
            const labelElm = getTextSvgElement(s['label'], shape.style, bounds);
            labelElm.setAttribute(
                'fill',
                getShapeStyle(shape.style, isDarkMode).stroke
            );
            const font = getFontStyle(shape.style);
            const size = getTextLabelSize(s['label'], font);
            labelElm.setAttribute('transform-origin', 'top left');
            labelElm.setAttribute(
                'transform',
                `translate(${bounds.width / 2}, ${
                    (bounds.height - size[1]) / 2
                })`
            );
            g.setAttribute('text-align', 'center');
            g.setAttribute('text-anchor', 'middle');
            g.appendChild(elm);
            g.appendChild(labelElm);
            return g;
        }
        return elm;
    };
}
