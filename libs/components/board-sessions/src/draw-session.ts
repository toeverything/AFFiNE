import { Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import {
    SessionType,
    TDStatus,
    TldrawPatch,
    TldrawCommand,
    DrawShape,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';
import { BaseSession } from './base-session';

export class DrawSession extends BaseSession {
    type = SessionType.Draw;
    performanceMode: undefined;
    status = TDStatus.Creating;
    topLeft: number[];
    points: number[][];
    initialShape: DrawShape;
    lastAdjustedPoint: number[];
    shiftedPoints: number[][] = [];
    shapeId: string;
    isLocked?: boolean;
    isExtending: boolean;
    lockedDirection?: 'horizontal' | 'vertical';

    constructor(app: TldrawApp, id: string) {
        super(app);
        const { originPoint } = this.app;
        this.shapeId = id;
        this.initialShape = this.app.getShape<DrawShape>(id);
        this.topLeft = [...this.initialShape.point];
        const currentPoint = [0, 0, originPoint[2] ?? 0.5];
        const delta = Vec.sub(originPoint, this.topLeft);
        const initialPoints = this.initialShape.points.map(pt =>
            Vec.sub(pt, delta).concat(pt[2])
        );
        this.isExtending = initialPoints.length > 0;
        const newPoints: number[][] = [];
        if (this.isExtending) {
            const prevPoint = initialPoints[initialPoints.length - 1];
            newPoints.push(prevPoint, prevPoint);
            // Continuing with shift
            const len = Math.ceil(Vec.dist(prevPoint, currentPoint) / 16);
            for (let i = 0; i < len; i++) {
                const t = i / (len - 1);
                newPoints.push(
                    Vec.lrp(prevPoint, currentPoint, t).concat(prevPoint[2])
                );
            }
        } else {
            newPoints.push(currentPoint);
        }
        // Add a first point but don't update the shape yet. We'll update
        // when the draw session ends; if the user hasn't added additional
        // points, this single point will be interpreted as a "dot" shape.
        this.points = [...initialPoints, ...newPoints];
        this.shiftedPoints = this.points.map(pt =>
            Vec.add(pt, delta).concat(pt[2])
        );
        this.lastAdjustedPoint = this.points[this.points.length - 1];
    }

    start = () => {
        const currentPoint = this.app.originPoint;
        const newAdjustedPoint = [0, 0, currentPoint[2] ?? 0.5];
        // Add the new adjusted point to the points array
        this.points.push(newAdjustedPoint);
        const topLeft = [
            Math.min(this.topLeft[0], currentPoint[0]),
            Math.min(this.topLeft[1], currentPoint[1]),
        ];
        const delta = Vec.sub(topLeft, currentPoint);
        this.topLeft = topLeft;
        this.shiftedPoints = this.points.map(pt =>
            Vec.toFixed(Vec.sub(pt, delta)).concat(pt[2])
        );

        return {
            document: {
                pages: {
                    [this.app.currentPageId]: {
                        shapes: {
                            [this.shapeId]: {
                                point: this.topLeft,
                                points: this.shiftedPoints,
                            },
                        },
                    },
                },
                pageStates: {
                    [this.app.currentPageId]: {
                        selectedIds: [this.shapeId],
                    },
                },
            },
        };
    };

    update = (): TldrawPatch | undefined => {
        const { shapeId } = this;
        const { currentPoint, originPoint, shiftKey } = this.app;

        // Even if we're not locked yet, we base the future locking direction
        // on the first dimension to reach a threshold, or the bigger dimension
        // once one or both dimensions have reached the threshold.
        if (!this.lockedDirection && this.points.length > 1) {
            const bounds = Utils.getBoundsFromPoints(this.points);
            if (bounds.width > 8 || bounds.height > 8) {
                this.lockedDirection =
                    bounds.width > bounds.height ? 'horizontal' : 'vertical';
            }
        }

        // Drawing while holding shift will "lock" the pen to either the
        // x or y axis, depending on the locking direction.
        if (shiftKey) {
            if (!this.isLocked && this.points.length > 2) {
                // If we're locking before knowing what direction we're in, set it
                // early based on the bigger dimension.
                if (!this.lockedDirection) {
                    const bounds = Utils.getBoundsFromPoints(this.points);
                    this.lockedDirection =
                        bounds.width > bounds.height
                            ? 'horizontal'
                            : 'vertical';
                }

                this.isLocked = true;
                // Start locking
                const returning = [...this.lastAdjustedPoint];

                if (this.lockedDirection === 'vertical') {
                    returning[0] = 0;
                } else {
                    returning[1] = 0;
                }

                this.points.push(returning.concat(currentPoint[2]));
            }
        } else if (this.isLocked) {
            this.isLocked = false;
        }

        if (this.isLocked) {
            if (this.lockedDirection === 'vertical') {
                currentPoint[0] = originPoint[0];
            } else {
                currentPoint[1] = originPoint[1];
            }
        }

        const change = this.addPoint(currentPoint);

        if (!change) {
            return;
        }

        return {
            document: {
                pages: {
                    [this.app.currentPageId]: {
                        shapes: {
                            [shapeId]: change,
                        },
                    },
                },
                pageStates: {
                    [this.app.currentPageId]: {
                        selectedIds: [shapeId],
                    },
                },
            },
        };
    };

    cancel = (): TldrawPatch | undefined => {
        const { shapeId } = this;
        const pageId = this.app.currentPageId;

        return {
            document: {
                pages: {
                    [pageId]: {
                        shapes: {
                            [shapeId]: this.isExtending
                                ? this.initialShape
                                : undefined,
                        },
                    },
                },
                pageStates: {
                    [pageId]: {
                        selectedIds: [],
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const { shapeId } = this;
        const pageId = this.app.currentPageId;
        const shape = this.app.getShape<DrawShape>(shapeId);
        return {
            id: 'create_draw',
            before: {
                document: {
                    pages: {
                        [pageId]: {
                            shapes: {
                                [shapeId]: this.isExtending
                                    ? this.initialShape
                                    : undefined,
                            },
                        },
                    },
                    pageStates: {
                        [pageId]: {
                            selectedIds: [],
                        },
                    },
                },
            },
            after: {
                document: {
                    pages: {
                        [pageId]: {
                            shapes: {
                                [shapeId]: {
                                    ...shape,
                                    point: Vec.toFixed(shape.point),
                                    points: shape.points.map(pt =>
                                        Vec.toFixed(pt)
                                    ),
                                    isComplete: true,
                                },
                            },
                        },
                    },
                    pageStates: {
                        [this.app.currentPageId]: {
                            selectedIds: [],
                        },
                    },
                },
            },
        };
    };

    addPoint = (currentPoint: number[]) => {
        const { originPoint } = this.app;
        // The new adjusted point
        const newAdjustedPoint = Vec.toFixed(
            Vec.sub(currentPoint, originPoint)
        ).concat(currentPoint[2]);

        // Don't add duplicate points.
        if (Vec.isEqual(this.lastAdjustedPoint, newAdjustedPoint)) return;

        // Add the new adjusted point to the points array
        this.points.push(newAdjustedPoint);

        // The new adjusted point is now the previous adjusted point.
        this.lastAdjustedPoint = newAdjustedPoint;

        // Does the input point create a new top left?
        const prevTopLeft = [...this.topLeft];

        const topLeft = [
            Math.min(this.topLeft[0], currentPoint[0]),
            Math.min(this.topLeft[1], currentPoint[1]),
        ];

        const delta = Vec.sub(topLeft, originPoint);

        // Time to shift some points!
        let points: number[][];

        if (prevTopLeft[0] !== topLeft[0] || prevTopLeft[1] !== topLeft[1]) {
            this.topLeft = topLeft;
            // If we have a new top left, then we need to iterate through
            // the "unshifted" points array and shift them based on the
            // offset between the new top left and the original top left.
            points = this.points.map(pt =>
                Vec.toFixed(Vec.sub(pt, delta)).concat(pt[2])
            );
        } else {
            // If the new top left is the same as the previous top left,
            // we don't need to shift anything: we just shift the new point
            // and add it to the shifted points array.
            points = [
                ...this.shiftedPoints,
                Vec.sub(newAdjustedPoint, delta).concat(newAdjustedPoint[2]),
            ];
        }

        this.shiftedPoints = points;

        return {
            point: this.topLeft,
            points,
        };
    };
}
