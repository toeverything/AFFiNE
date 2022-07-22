import {
    TLBoundsCorner,
    TLSnapLine,
    TLBoundsEdge,
    Utils,
    TLBoundsWithCenter,
    TLBounds,
} from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import {
    SessionType,
    TldrawCommand,
    TldrawPatch,
    TDShape,
    TDStatus,
    SLOW_SPEED,
    SNAP_DISTANCE,
} from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import { BaseSession } from './base-session';
import type { TldrawApp } from '@toeverything/components/board-state';

type SnapInfo =
    | {
          state: 'empty';
      }
    | {
          state: 'ready';
          bounds: TLBoundsWithCenter[];
      };

export class TransformSingleSession extends BaseSession {
    type = SessionType.TransformSingle;
    status = TDStatus.Transforming;
    performanceMode: undefined;
    transformType: TLBoundsEdge | TLBoundsCorner;
    scaleX = 1;
    scaleY = 1;
    isCreate: boolean;
    initialShape: TDShape;
    initialShapeBounds: TLBounds;
    initialCommonBounds: TLBounds;
    snapInfo: SnapInfo = { state: 'empty' };
    prevPoint = [0, 0];
    speed = 1;

    constructor(
        app: TldrawApp,
        id: string,
        transformType: TLBoundsEdge | TLBoundsCorner,
        isCreate = false
    ) {
        super(app);
        this.isCreate = isCreate;
        this.transformType = transformType;

        const shape = this.app.getShape(id);
        this.initialShape = shape;
        this.initialShapeBounds = TLDR.get_bounds(shape);
        this.initialCommonBounds = TLDR.get_rotated_bounds(shape);
        this.app.rotationInfo.selectedIds = [shape.id];
    }

    start = (): TldrawPatch | undefined => {
        this.snapInfo = {
            state: 'ready',
            bounds: this.app.shapes
                .filter(shape => shape.id !== this.initialShape.id)
                .map(shape =>
                    Utils.getBoundsWithCenter(TLDR.get_rotated_bounds(shape))
                ),
        };

        return void null;
    };

    update = (): TldrawPatch | undefined => {
        const {
            transformType,
            initialShape,
            initialShapeBounds,
            app: {
                settings: { isSnapping, showGrid },
                currentPageId,
                pageState: { camera },
                viewport,
                currentPoint,
                previousPoint,
                originPoint,
                currentGrid,
                shiftKey,
                altKey,
                metaKey,
            },
        } = this;

        if (initialShape.isLocked) return void null;

        const shapes = {} as Record<string, Partial<TDShape>>;

        const delta = altKey
            ? Vec.mul(Vec.sub(currentPoint, originPoint), 2)
            : Vec.sub(currentPoint, originPoint);

        const shape = this.app.getShape(initialShape.id);

        const utils = TLDR.get_shape_util(shape);

        let newBounds = Utils.getTransformedBoundingBox(
            initialShapeBounds,
            transformType,
            delta,
            shape.rotation,
            shiftKey || shape.isAspectRatioLocked || utils.isAspectRatioLocked
        );

        if (altKey) {
            newBounds = {
                ...newBounds,
                ...Utils.centerBounds(
                    newBounds,
                    Utils.getBoundsCenter(initialShapeBounds)
                ),
            };
        }

        if (showGrid) {
            newBounds = {
                ...newBounds,
                ...Utils.snapBoundsToGrid(newBounds, currentGrid),
            };
        }

        // Should we snap?

        const speed = Vec.dist(currentPoint, previousPoint);

        const speedChange = speed - this.speed;

        this.speed = this.speed + speedChange * (speedChange > 1 ? 0.5 : 0.15);

        let snapLines: TLSnapLine[] = [];

        if (
            ((isSnapping && !metaKey) || (!isSnapping && metaKey)) &&
            !initialShape.rotation && // not now anyway
            this.speed * camera.zoom < SLOW_SPEED &&
            this.snapInfo.state === 'ready'
        ) {
            const snapResult = Utils.getSnapPoints(
                Utils.getBoundsWithCenter(newBounds),
                this.snapInfo.bounds.filter(
                    bounds =>
                        Utils.boundsContain(viewport, bounds) ||
                        Utils.boundsCollide(viewport, bounds)
                ),
                SNAP_DISTANCE / camera.zoom
            );

            if (snapResult) {
                snapLines = snapResult.snapLines;

                newBounds = Utils.getTransformedBoundingBox(
                    initialShapeBounds,
                    transformType,
                    Vec.sub(delta, snapResult.offset),
                    shape.rotation,
                    shiftKey ||
                        shape.isAspectRatioLocked ||
                        utils.isAspectRatioLocked
                );
            }
        }

        const afterShape = TLDR.get_shape_util(shape).transformSingle(
            shape,
            newBounds,
            {
                initialShape,
                type: this.transformType,
                scaleX: newBounds.scaleX,
                scaleY: newBounds.scaleY,
                transformOrigin: [0.5, 0.5],
            }
        );

        if (afterShape) {
            shapes[shape.id] = afterShape;
        }

        if (showGrid && afterShape && afterShape.point) {
            afterShape.point = Vec.snap(afterShape.point, currentGrid);
        }

        return {
            appState: {
                snapLines,
            },
            document: {
                pages: {
                    [currentPageId]: {
                        shapes,
                    },
                },
            },
        };
    };

    cancel = (): TldrawPatch | undefined => {
        const {
            initialShape,
            app: { currentPageId },
        } = this;

        const shapes = {} as Record<string, TDShape | undefined>;

        if (this.isCreate) {
            shapes[initialShape.id] = undefined;
        } else {
            shapes[initialShape.id] = initialShape;
        }

        return {
            appState: {
                snapLines: [],
            },
            document: {
                pages: {
                    [currentPageId]: {
                        shapes,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: this.isCreate ? [] : [initialShape.id],
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const {
            initialShape,
            app: { currentPageId },
        } = this;

        if (initialShape.isLocked) return;

        if (
            this.isCreate &&
            Vec.dist(this.app.originPoint, this.app.currentPoint) < 2
        ) {
            return this.cancel();
        }

        const beforeShapes = {} as Record<string, Partial<TDShape> | undefined>;
        const afterShapes = {} as Record<string, Partial<TDShape>>;

        beforeShapes[initialShape.id] = this.isCreate
            ? undefined
            : initialShape;

        afterShapes[initialShape.id] = TLDR.on_session_complete(
            this.app.getShape(initialShape.id)
        );

        return {
            id: 'transform_single',
            before: {
                appState: {
                    snapLines: [],
                },
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: beforeShapes,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: this.isCreate ? [] : [initialShape.id],
                            editingId: undefined,
                            hoveredId: undefined,
                        },
                    },
                },
            },
            after: {
                appState: {
                    snapLines: [],
                },
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: afterShapes,
                        },
                    },
                    pageStates: {
                        [currentPageId]: {
                            selectedIds: [initialShape.id],
                            editingId: undefined,
                            hoveredId: undefined,
                        },
                    },
                },
            },
        };
    };
}
