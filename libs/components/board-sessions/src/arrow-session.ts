/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    ArrowBinding,
    ArrowShape,
    TDShape,
    TDBinding,
    TDStatus,
    SessionType,
    TDShapeType,
    TldrawPatch,
    TldrawCommand,
} from '@toeverything/components/board-types';
import { Vec } from '@tldraw/vec';
import { TLDR, deepCopy } from '@toeverything/components/board-state';
import { shapeUtils } from '@toeverything/components/board-shapes';
import { BaseSession } from './base-session';
import type { TldrawApp } from '@toeverything/components/board-state';
import { Utils } from '@tldraw/core';

export class ArrowSession extends BaseSession {
    type = SessionType.Arrow;
    performanceMode: undefined;
    status = TDStatus.TranslatingHandle;
    newStartBindingId = Utils.uniqueId();
    draggedBindingId = Utils.uniqueId();
    didBind = false;
    initialShape: ArrowShape;
    handleId: 'start' | 'end';
    bindableShapeIds: string[];
    initialBinding?: TDBinding;
    startBindingShapeId?: string;
    isCreate: boolean;

    constructor(
        app: TldrawApp,
        shapeId: string,
        handleId: 'start' | 'end',
        isCreate = false
    ) {
        super(app);

        this.isCreate = isCreate;

        const { currentPageId } = app.state.appState;

        const page = app.state.document.pages[currentPageId];

        this.handleId = handleId;

        this.initialShape = deepCopy(page.shapes[shapeId] as ArrowShape);

        this.bindableShapeIds = TLDR.get_bindable_shape_ids(app.state).filter(
            id =>
                !(
                    id === this.initialShape.id ||
                    id === this.initialShape.parentId
                )
        );

        // TODO: find out why this the oppositeHandleBindingId is sometimes missing
        const oppositeHandleBindingId =
            this.initialShape.handles[handleId === 'start' ? 'end' : 'start']
                ?.bindingId;

        if (oppositeHandleBindingId) {
            const oppositeToId = page.bindings[oppositeHandleBindingId]?.toId;
            if (oppositeToId) {
                this.bindableShapeIds = this.bindableShapeIds.filter(
                    id => id !== oppositeToId
                );
            }
        }

        const { originPoint } = this.app;

        if (this.isCreate) {
            // If we're creating a new shape, should we bind its first point?
            // The method may return undefined, which is correct if there is no
            // bindable shape under the pointer.
            this.startBindingShapeId = this.bindableShapeIds
                .map(id => page.shapes[id])
                .filter(shape =>
                    Utils.pointInBounds(
                        originPoint,
                        TLDR.get_shape_util(shape).getBounds(shape)
                    )
                )
                .sort((a, b) => {
                    // TODO - We should be smarter here, what's the right logic?
                    return b.childIndex - a.childIndex;
                })[0]?.id;

            if (this.startBindingShapeId) {
                this.bindableShapeIds.splice(
                    this.bindableShapeIds.indexOf(this.startBindingShapeId),
                    1
                );
            }
        } else {
            // If we're editing an existing line, is there a binding already
            // for the dragging handle?
            const initialBindingId =
                this.initialShape.handles[this.handleId].bindingId;

            if (initialBindingId) {
                this.initialBinding = page.bindings[initialBindingId];
            } else {
                // If not, explicitly set this handle to undefined, so that it gets deleted on undo
                this.initialShape.handles[this.handleId].bindingId = undefined;
            }
        }
    }

    start = (): TldrawPatch | undefined => void null;

    update = (): TldrawPatch | undefined => {
        const { initialShape } = this;
        const {
            currentPoint,
            shiftKey,
            altKey,
            metaKey,
            currentGrid,
            settings: { showGrid },
        } = this.app;

        const shape = this.app.getShape<ArrowShape>(initialShape.id);

        if (shape.isLocked) return;

        const { handles } = initialShape;

        const handleId = this.handleId as keyof typeof handles;
        // If the handle can bind, then we need to search bindable shapes for
        // a binding.
        if (!handles[handleId].canBind) return;

        // Find the delta (in shape space)
        let delta = Vec.sub(
            currentPoint,
            Vec.add(handles[handleId].point, initialShape.point)
        );

        if (shiftKey) {
            const A = altKey
                ? Vec.med(handles.start.point, handles.end.point)
                : handles[handleId === 'start' ? 'end' : 'start'].point;
            const B = handles[handleId].point;
            const C = Vec.add(B, delta);

            const angle = Vec.angle(A, C);

            const adjusted = Vec.rotWith(
                C,
                A,
                Utils.snapAngleToSegments(angle, 24) - angle
            );

            delta = Vec.add(delta, Vec.sub(adjusted, C));
        }

        const nextPoint = Vec.add(handles[handleId].point, delta);

        const handleChanges: Partial<any> = {
            [handleId]: {
                ...handles[handleId],
                point: showGrid
                    ? Vec.snap(nextPoint, currentGrid)
                    : Vec.toFixed(nextPoint),
                bindingId: undefined,
            },
        };

        if (altKey) {
            // If the user is holding alt key, apply the inverse delta
            // to the oppoosite handle.
            const oppositeHandleId = handleId === 'start' ? 'end' : 'start';

            const nextPoint = Vec.sub(handles[oppositeHandleId].point, delta);

            handleChanges[oppositeHandleId] = {
                ...handles[oppositeHandleId],
                point: showGrid
                    ? Vec.snap(nextPoint, currentGrid)
                    : Vec.toFixed(nextPoint),
                bindingId: undefined,
            };
        }

        const utils = shapeUtils[TDShapeType.Arrow];
        const handleChange = utils.onHandleChange?.(
            initialShape,
            handleChanges
        );

        // If the handle changed produced no change, bail here
        if (!handleChange) return;

        // If nothing changes, we want these to be the same object reference as
        // before. If it does change, we'll redefine this later on. And if we've
        // made it this far, the shape should be a new object reference that
        // incorporates the changes we've made due to the handle movement.
        const next: {
            shape: ArrowShape;
            bindings: Record<string, TDBinding | undefined>;
        } = {
            shape: Utils.deepMerge(shape, handleChange),
            bindings: {},
        };

        let draggedBinding: ArrowBinding | undefined;

        const draggingHandle = next.shape.handles[this.handleId];

        const oppositeHandle =
            next.shape.handles[this.handleId === 'start' ? 'end' : 'start'];

        // START BINDING
        // If we have a start binding shape id, the recompute the binding
        // point based on the current end handle position
        if (this.startBindingShapeId) {
            let nextStartBinding: ArrowBinding | undefined;

            const startTarget = this.app.page.shapes[this.startBindingShapeId];

            const startTargetUtils = TLDR.get_shape_util(startTarget);

            const center = startTargetUtils.getCenter(startTarget);

            const startHandle = next.shape.handles.start;

            const endHandle = next.shape.handles.end;

            const rayPoint = Vec.add(startHandle.point, next.shape.point);

            if (Vec.isEqual(rayPoint, center)) rayPoint[1]++; // Fix bug where ray and center are identical

            const rayOrigin = center;

            const isInsideShape = startTargetUtils.hitTestPoint(
                startTarget,
                currentPoint
            );

            const rayDirection = Vec.uni(Vec.sub(rayPoint, rayOrigin));

            const hasStartBinding =
                this.app.getBinding(this.newStartBindingId) !== undefined;

            // Don't bind the start handle if both handles are inside of the target shape.
            if (
                !metaKey &&
                !startTargetUtils.hitTestPoint(
                    startTarget,
                    Vec.add(next.shape.point, endHandle.point)
                )
            ) {
                nextStartBinding = this.find_binding_point(
                    shape,
                    startTarget,
                    'start',
                    this.newStartBindingId,
                    center,
                    rayOrigin,
                    rayDirection,
                    isInsideShape
                );
            }

            if (nextStartBinding && !hasStartBinding) {
                // Bind the arrow's start handle to the start target
                this.didBind = true;

                next.bindings[this.newStartBindingId] = nextStartBinding;

                next.shape = Utils.deepMerge(next.shape, {
                    handles: {
                        start: {
                            bindingId: nextStartBinding.id,
                        },
                    },
                });
            } else if (!nextStartBinding && hasStartBinding) {
                // Remove the start binding
                this.didBind = false;

                next.bindings[this.newStartBindingId] = undefined;

                next.shape = Utils.deepMerge(initialShape, {
                    handles: {
                        start: {
                            bindingId: undefined,
                        },
                    },
                });
            }
        }

        // DRAGGED POINT BINDING
        if (!metaKey) {
            const rayOrigin = Vec.add(oppositeHandle.point, next.shape.point);

            const rayPoint = Vec.add(draggingHandle.point, next.shape.point);

            const rayDirection = Vec.uni(Vec.sub(rayPoint, rayOrigin));

            const startPoint = Vec.add(
                next.shape.point!,
                next.shape.handles!.start.point!
            );

            const endPoint = Vec.add(
                next.shape.point!,
                next.shape.handles!.end.point!
            );

            const targets = this.bindableShapeIds
                .map(id => this.app.page.shapes[id])
                .sort((a, b) => b.childIndex - a.childIndex)
                .filter(shape => {
                    const utils = TLDR.get_shape_util(shape);
                    return ![startPoint, endPoint].every(point =>
                        utils.hitTestPoint(shape, point)
                    );
                });

            for (const target of targets) {
                draggedBinding = this.find_binding_point(
                    shape,
                    target,
                    this.handleId,
                    this.draggedBindingId,
                    rayPoint,
                    rayOrigin,
                    rayDirection,
                    altKey
                );

                if (draggedBinding) break;
            }
        }
        if (draggedBinding) {
            // Create the dragged point binding
            this.didBind = true;

            next.bindings[this.draggedBindingId] = draggedBinding;

            next.shape = Utils.deepMerge(next.shape, {
                handles: {
                    [this.handleId]: {
                        bindingId: this.draggedBindingId,
                    },
                },
            });
        } else {
            // Remove the dragging point binding
            this.didBind = this.didBind || false;

            const currentBindingId = shape.handles[this.handleId].bindingId;

            if (currentBindingId !== undefined) {
                next.bindings[currentBindingId] = undefined;

                next.shape = Utils.deepMerge(next.shape, {
                    handles: {
                        [this.handleId]: {
                            bindingId: undefined,
                        },
                    },
                });
            }
        }

        const change = TLDR.get_shape_util<ArrowShape>(
            next.shape
        ).onHandleChange?.(next.shape, next.shape.handles);

        return {
            document: {
                pages: {
                    [this.app.currentPageId]: {
                        shapes: {
                            [shape.id]: { ...next.shape, ...(change ?? {}) },
                        },
                        bindings: next.bindings,
                    },
                },
                pageStates: {
                    [this.app.currentPageId]: {
                        bindingId: next.shape.handles[handleId].bindingId,
                    },
                },
            },
        };
    };

    cancel = (): TldrawPatch | undefined => {
        const {
            initialShape,
            initialBinding,
            newStartBindingId,
            draggedBindingId,
        } = this;

        const currentShape = TLDR.on_session_complete(
            this.app.page.shapes[initialShape.id]
        ) as ArrowShape;

        const isDeleting =
            this.isCreate ||
            Vec.dist(
                currentShape.handles.start.point,
                currentShape.handles.end.point
            ) < 4;

        const afterBindings: Record<string, TDBinding | undefined> = {};

        afterBindings[draggedBindingId] = undefined;

        if (initialBinding) {
            afterBindings[initialBinding.id] = isDeleting
                ? undefined
                : initialBinding;
        }

        if (newStartBindingId) {
            afterBindings[newStartBindingId] = undefined;
        }

        return {
            document: {
                pages: {
                    [this.app.currentPageId]: {
                        shapes: {
                            [initialShape.id]: isDeleting
                                ? undefined
                                : initialShape,
                        },
                        bindings: afterBindings,
                    },
                },
                pageStates: {
                    [this.app.currentPageId]: {
                        selectedIds: isDeleting ? [] : [initialShape.id],
                        bindingId: undefined,
                        hoveredId: undefined,
                        editingId: undefined,
                    },
                },
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const {
            initialShape,
            initialBinding,
            newStartBindingId,
            startBindingShapeId,
            handleId,
        } = this;

        const currentShape = TLDR.on_session_complete(
            this.app.page.shapes[initialShape.id]
        ) as ArrowShape;

        const currentBindingId = currentShape.handles[handleId].bindingId;

        const length = Vec.dist(
            currentShape.handles.start.point,
            currentShape.handles.end.point
        );

        if (!(currentBindingId || initialBinding) && length < 4)
            return this.cancel();

        const beforeBindings: Partial<Record<string, TDBinding>> = {};

        const afterBindings: Partial<Record<string, TDBinding>> = {};

        if (initialBinding) {
            beforeBindings[initialBinding.id] = this.isCreate
                ? undefined
                : initialBinding;
            afterBindings[initialBinding.id] = undefined;
        }

        if (currentBindingId) {
            beforeBindings[currentBindingId] = undefined;
            afterBindings[currentBindingId] =
                this.app.page.bindings[currentBindingId];
        }

        if (startBindingShapeId) {
            beforeBindings[newStartBindingId] = undefined;
            afterBindings[newStartBindingId] =
                this.app.page.bindings[newStartBindingId];
        }

        return {
            id: 'arrow',
            before: {
                document: {
                    pages: {
                        [this.app.currentPageId]: {
                            shapes: {
                                [initialShape.id]: this.isCreate
                                    ? undefined
                                    : initialShape,
                            },
                            bindings: beforeBindings,
                        },
                    },
                    pageStates: {
                        [this.app.currentPageId]: {
                            selectedIds: this.isCreate ? [] : [initialShape.id],
                            bindingId: undefined,
                            hoveredId: undefined,
                            editingId: undefined,
                        },
                    },
                },
            },
            after: {
                document: {
                    pages: {
                        [this.app.currentPageId]: {
                            shapes: {
                                [initialShape.id]: currentShape,
                            },
                            bindings: afterBindings,
                        },
                    },
                    pageStates: {
                        [this.app.currentPageId]: {
                            selectedIds: [initialShape.id],
                            bindingId: undefined,
                            hoveredId: undefined,
                            editingId: undefined,
                        },
                    },
                },
            },
        };
    };

    private find_binding_point = (
        shape: ArrowShape,
        target: TDShape,
        handleId: 'start' | 'end',
        bindingId: string,
        point: number[],
        origin: number[],
        direction: number[],
        bindAnywhere: boolean
    ) => {
        const util = TLDR.get_shape_util<TDShape>(target.type);

        const bindingPoint = util.getBindingPoint(
            target,
            shape,
            point, // fix dead center bug
            origin,
            direction,
            bindAnywhere
        );

        // Not all shapes will produce a binding point
        if (!bindingPoint) return;

        return {
            id: bindingId,
            type: 'arrow',
            fromId: shape.id,
            toId: target.id,
            handleId: handleId,
            point: Vec.toFixed(bindingPoint.point),
            distance: bindingPoint.distance,
        };
    };
}
