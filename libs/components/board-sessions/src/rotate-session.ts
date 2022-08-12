import { Utils } from '@tldraw/core';
import { Vec } from '@tldraw/vec';
import type { TldrawApp } from '@toeverything/components/board-state';
import { TLDR } from '@toeverything/components/board-state';
import {
    SessionType,
    TDShape,
    TDShapeType,
    TDStatus,
    TldrawCommand,
    TldrawPatch,
} from '@toeverything/components/board-types';
import { BaseSession } from './base-session';

export class RotateSession extends BaseSession {
    type = SessionType.Rotate;
    status = TDStatus.Transforming;
    performanceMode: undefined;
    delta = [0, 0];
    commonBoundsCenter: number[];
    initialAngle: number;
    initialShapes: {
        shape: TDShape;
        center: number[];
    }[];
    changes: Record<string, Partial<TDShape>> = {};

    constructor(app: TldrawApp) {
        super(app);

        const {
            app: { currentPageId, pageState, originPoint },
        } = this;

        const initialShapes = TLDR.get_selected_branch_snapshot(
            app.state,
            currentPageId
        ).filter(shape => !shape.isLocked);

        if (initialShapes.length === 0) {
            throw Error('No selected shapes!');
        }

        if (app.rotationInfo.selectedIds === pageState.selectedIds) {
            if (app.rotationInfo.center === undefined) {
                throw Error('We should have a center for rotation!');
            }

            this.commonBoundsCenter = app.rotationInfo.center;
        } else {
            this.commonBoundsCenter = Utils.getBoundsCenter(
                Utils.getCommonBounds(initialShapes.map(TLDR.get_bounds))
            );
            app.rotationInfo.selectedIds = pageState.selectedIds;
            app.rotationInfo.center = this.commonBoundsCenter;
        }

        this.initialShapes = initialShapes
            .filter(shape => shape.children === undefined)
            .map(shape => {
                return {
                    shape,
                    center: this.app.getShapeUtil(shape).getCenter(shape),
                };
            });

        this.initialAngle = Vec.angle(this.commonBoundsCenter, originPoint);
    }

    start = (): TldrawPatch | undefined => void null;

    update = (): TldrawPatch | undefined => {
        const {
            commonBoundsCenter,
            initialShapes,
            app: { currentPageId, currentPoint, shiftKey },
        } = this;

        const filteredShapes = initialShapes.filter(
            shape => shape.shape.type !== TDShapeType.Editor
        );

        const shapes: Record<string, Partial<TDShape>> = {};

        let directionDelta =
            Vec.angle(commonBoundsCenter, currentPoint) - this.initialAngle;

        if (shiftKey) {
            directionDelta = Utils.snapAngleToSegments(directionDelta, 24); // 15 degrees
        }

        // Update the shapes
        filteredShapes.forEach(({ center, shape }) => {
            const { rotation = 0 } = shape;
            let shapeDelta = 0;

            if (shiftKey) {
                const snappedRotation = Utils.snapAngleToSegments(rotation, 24);
                shapeDelta = snappedRotation - rotation;
            }

            const change = TLDR.get_rotated_shape_mutation(
                shape,
                center,
                commonBoundsCenter,
                shiftKey ? directionDelta + shapeDelta : directionDelta
            );

            if (change) {
                shapes[shape.id] = change;
            }
        });

        this.changes = shapes;

        return {
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
            initialShapes,
            app: { currentPageId },
        } = this;

        const shapes: Record<string, TDShape> = {};
        initialShapes.forEach(({ shape }) => (shapes[shape.id] = shape));

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes,
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const {
            initialShapes,
            app: { currentPageId },
        } = this;

        const beforeShapes = {} as Record<string, Partial<TDShape>>;
        const afterShapes = this.changes;

        initialShapes.forEach(({ shape: { id, point, rotation, handles } }) => {
            beforeShapes[id] = { point, rotation, handles };
        });

        return {
            id: 'rotate',
            before: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: beforeShapes,
                        },
                    },
                },
            },
            after: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: afterShapes,
                        },
                    },
                },
            },
        };
    };
}
