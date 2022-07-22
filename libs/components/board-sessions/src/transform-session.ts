import { TLBounds, TLBoundsCorner, TLBoundsEdge, Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import type { TLSnapLine, TLBoundsWithCenter } from '@tldraw/core';
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

export class TransformSession extends BaseSession {
    type = SessionType.Transform;
    performanceMode: undefined;
    status = TDStatus.Transforming;
    scaleX = 1;
    scaleY = 1;
    initialShapes: TDShape[];
    initialShapeIds: string[];
    initialSelectedIds: string[];
    shapeBounds: {
        initialShape: TDShape;
        initialShapeBounds: TLBounds;
        transformOrigin: number[];
    }[];
    hasUnlockedShapes: boolean;
    isAllAspectRatioLocked: boolean;
    initialCommonBounds: TLBounds;
    snapInfo: SnapInfo = { state: 'empty' };
    prevPoint = [0, 0];
    speed = 1;

    constructor(
        app: TldrawApp,
        public transformType:
            | TLBoundsEdge
            | TLBoundsCorner = TLBoundsCorner.BottomRight,
        public isCreate = false
    ) {
        super(app);
        this.initialSelectedIds = [...this.app.selectedIds];
        this.app.rotationInfo.selectedIds = [...this.initialSelectedIds];

        this.initialShapes = TLDR.get_selected_branch_snapshot(
            this.app.state,
            this.app.currentPageId
        ).filter(shape => !shape.isLocked);

        this.initialShapeIds = this.initialShapes.map(shape => shape.id);

        this.hasUnlockedShapes = this.initialShapes.length > 0;

        this.isAllAspectRatioLocked = this.initialShapes.every(
            shape =>
                shape.isAspectRatioLocked ||
                TLDR.get_shape_util(shape).isAspectRatioLocked
        );

        const shapesBounds = Object.fromEntries(
            this.initialShapes.map(shape => [shape.id, TLDR.get_bounds(shape)])
        );

        const boundsArr = Object.values(shapesBounds);

        this.initialCommonBounds = Utils.getCommonBounds(boundsArr);

        const initialInnerBounds = Utils.getBoundsFromPoints(
            boundsArr.map(Utils.getBoundsCenter)
        );

        // Return a mapping of shapes to bounds together with the relative
        // positions of the shape's bounds within the common bounds shape.
        this.shapeBounds = this.initialShapes.map(shape => {
            const initialShapeBounds = shapesBounds[shape.id];
            const ic = Utils.getBoundsCenter(initialShapeBounds);

            const ix =
                (ic[0] - initialInnerBounds.minX) / initialInnerBounds.width;
            const iy =
                (ic[1] - initialInnerBounds.minY) / initialInnerBounds.height;

            return {
                initialShape: shape,
                initialShapeBounds,
                transformOrigin: [ix, iy],
            };
        });
    }

    start = (): TldrawPatch | undefined => {
        this.snapInfo = {
            state: 'ready',
            bounds: this.app.shapes
                .filter(shape => !this.initialShapeIds.includes(shape.id))
                .map(shape =>
                    Utils.getBoundsWithCenter(TLDR.get_rotated_bounds(shape))
                ),
        };

        return void null;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update = (): TldrawPatch | undefined => {
        const {
            transformType,
            shapeBounds,
            initialCommonBounds,
            isAllAspectRatioLocked,
            app: {
                currentPageId,
                pageState: { camera },
                viewport,
                currentPoint,
                previousPoint,
                originPoint,
                shiftKey,
                altKey,
                metaKey,
                currentGrid,
                settings: { isSnapping, showGrid },
            },
        } = this;

        const shapes = {} as Record<string, TDShape>;

        const delta = altKey
            ? Vec.mul(Vec.sub(currentPoint, originPoint), 2)
            : Vec.sub(currentPoint, originPoint);

        let newBounds = Utils.getTransformedBoundingBox(
            initialCommonBounds,
            transformType,
            delta,
            0,
            shiftKey || isAllAspectRatioLocked
        );

        if (altKey) {
            newBounds = {
                ...newBounds,
                ...Utils.centerBounds(
                    newBounds,
                    Utils.getBoundsCenter(initialCommonBounds)
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
                    initialCommonBounds,
                    transformType,
                    Vec.sub(delta, snapResult.offset),
                    0,
                    shiftKey || isAllAspectRatioLocked
                );
            }
        }

        // Now work backward to calculate a new bounding box for each of the shapes.

        this.scaleX = newBounds.scaleX;
        this.scaleY = newBounds.scaleY;

        shapeBounds.forEach(
            ({ initialShape, initialShapeBounds, transformOrigin }) => {
                let newShapeBounds = Utils.getRelativeTransformedBoundingBox(
                    newBounds,
                    initialCommonBounds,
                    initialShapeBounds,
                    this.scaleX < 0,
                    this.scaleY < 0
                );

                if (showGrid) {
                    newShapeBounds = Utils.snapBoundsToGrid(
                        newShapeBounds,
                        currentGrid
                    );
                }

                const afterShape = TLDR.transform(
                    this.app.getShape(initialShape.id),
                    newShapeBounds,
                    {
                        type: this.transformType,
                        initialShape,
                        scaleX: this.scaleX,
                        scaleY: this.scaleY,
                        transformOrigin,
                    }
                );

                shapes[initialShape.id] = afterShape;
            }
        );

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
            shapeBounds,
            app: { currentPageId },
        } = this;

        const shapes = {} as Record<string, TDShape | undefined>;

        if (this.isCreate) {
            shapeBounds.forEach(
                shape => (shapes[shape.initialShape.id] = undefined)
            );
        } else {
            shapeBounds.forEach(
                shape => (shapes[shape.initialShape.id] = shape.initialShape)
            );
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
                        selectedIds: this.isCreate
                            ? []
                            : shapeBounds.map(shape => shape.initialShape.id),
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const {
            isCreate,
            shapeBounds,
            hasUnlockedShapes,
            app: { currentPageId },
        } = this;

        if (!hasUnlockedShapes) return;

        if (
            this.isCreate &&
            Vec.dist(this.app.originPoint, this.app.currentPoint) < 2
        ) {
            return this.cancel();
        }

        const beforeShapes: Record<string, TDShape | undefined> = {};
        const afterShapes: Record<string, TDShape> = {};

        let beforeSelectedIds: string[];
        let afterSelectedIds: string[];

        if (isCreate) {
            beforeSelectedIds = [];
            afterSelectedIds = [];
            shapeBounds.forEach(({ initialShape }) => {
                beforeShapes[initialShape.id] = undefined;
                afterShapes[initialShape.id] = this.app.getShape(
                    initialShape.id
                );
            });
        } else {
            beforeSelectedIds = this.initialSelectedIds;
            afterSelectedIds = this.initialSelectedIds;
            shapeBounds.forEach(({ initialShape }) => {
                beforeShapes[initialShape.id] = initialShape;
                afterShapes[initialShape.id] = this.app.getShape(
                    initialShape.id
                );
            });
        }

        return {
            id: 'transform',
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
                            selectedIds: beforeSelectedIds,
                            hoveredId: undefined,
                            editingId: undefined,
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
                            selectedIds: afterSelectedIds,
                            hoveredId: undefined,
                            editingId: undefined,
                        },
                    },
                },
            },
        };
    };
}
