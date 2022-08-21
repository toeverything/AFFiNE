import {
    TLBoundsCorner,
    TLBoundsEdge,
    TLBoundsEventHandler,
    TLBoundsHandleEventHandler,
    TLCanvasEventHandler,
    TLKeyboardEventHandler,
    TLPointerEventHandler,
    TLShapeCloneHandler,
    Utils,
} from '@tldraw/core';
import Vec from '@tldraw/vec';
import { BaseTool, TLDR } from '@toeverything/components/board-state';
import {
    CLONING_DISTANCE,
    DEAD_ZONE,
    SessionType,
} from '@toeverything/components/board-types';

enum Status {
    Idle = 'idle',
    Creating = 'creating',
    Pinching = 'pinching',
    PointingCanvas = 'pointingCanvas',
    PointingHandle = 'pointingHandle',
    PointingBounds = 'pointingBounds',
    PointingClone = 'pointingClone',
    TranslatingClone = 'translatingClone',
    PointingBoundsHandle = 'pointingBoundsHandle',
    TranslatingHandle = 'translatingHandle',
    Translating = 'translating',
    Transforming = 'transforming',
    Rotating = 'rotating',
    Brushing = 'brushing',
    GridCloning = 'gridCloning',
    ClonePainting = 'clonePainting',
}

export class SelectTool extends BaseTool<Status> {
    override type = 'select' as const;

    pointedId?: string;

    selectedGroupId?: string;

    pointedHandleId?: 'start' | 'end' | 'bend';

    pointedBoundsHandle?:
        | TLBoundsCorner
        | TLBoundsEdge
        | 'rotate'
        | 'center'
        | 'left'
        | 'right';

    pointedLinkHandleId?: 'left' | 'center' | 'right';

    /* --------------------- Methods -------------------- */

    private deselect(id: string) {
        this.app.select(...this.app.selectedIds.filter(oid => oid !== id));
    }

    private select(id: string) {
        this.app.select(id);
    }

    private push_select(id: string) {
        const shape = this.app.getShape(id);
        this.app.select(
            ...this.app.selectedIds.filter(oid => oid !== shape.parentId),
            id
        );
    }

    private select_none() {
        this.app.selectNone();
    }

    override onEnter = () => {
        this.set_status(Status.Idle);
    };

    override onExit = () => {
        this.set_status(Status.Idle);
    };

    clonePaint = (point: number[]) => {
        if (this.app.selectedIds.length === 0) return;

        const shapes = this.app.selectedIds.map(id => this.app.getShape(id));

        const bounds = Utils.expandBounds(
            Utils.getCommonBounds(shapes.map(TLDR.get_bounds)),
            16
        );

        const center = Utils.getBoundsCenter(bounds);

        const size = [bounds.width, bounds.height];

        const gridPoint = [
            center[0] +
                size[0] *
                    Math.floor((point[0] + size[0] / 2 - center[0]) / size[0]),
            center[1] +
                size[1] *
                    Math.floor((point[1] + size[1] / 2 - center[1]) / size[1]),
        ];

        const centeredBounds = Utils.centerBounds(bounds, gridPoint);

        const hit = this.app.shapes.some(shape =>
            TLDR.get_shape_util(shape).hitTestBounds(shape, centeredBounds)
        );

        if (!hit) {
            this.app.duplicate(this.app.selectedIds, gridPoint);
        }
    };

    getShapeClone = (
        id: string,
        side:
            | 'top'
            | 'right'
            | 'bottom'
            | 'left'
            | 'topLeft'
            | 'topRight'
            | 'bottomRight'
            | 'bottomLeft'
    ) => {
        const shape = this.app.getShape(id);
        const utils = TLDR.get_shape_util(shape);

        if (utils.canClone) {
            const bounds = utils.getBounds(shape);

            const center = utils.getCenter(shape);

            let point = {
                top: [
                    bounds.minX,
                    bounds.minY - (bounds.height + CLONING_DISTANCE),
                ],
                right: [bounds.maxX + CLONING_DISTANCE, bounds.minY],
                bottom: [bounds.minX, bounds.maxY + CLONING_DISTANCE],
                left: [
                    bounds.minX - (bounds.width + CLONING_DISTANCE),
                    bounds.minY,
                ],
                topLeft: [
                    bounds.minX - (bounds.width + CLONING_DISTANCE),
                    bounds.minY - (bounds.height + CLONING_DISTANCE),
                ],
                topRight: [
                    bounds.maxX + CLONING_DISTANCE,
                    bounds.minY - (bounds.height + CLONING_DISTANCE),
                ],
                bottomLeft: [
                    bounds.minX - (bounds.width + CLONING_DISTANCE),
                    bounds.maxY + CLONING_DISTANCE,
                ],
                bottomRight: [
                    bounds.maxX + CLONING_DISTANCE,
                    bounds.maxY + CLONING_DISTANCE,
                ],
            }[side];

            if (shape.rotation !== 0) {
                const newCenter = Vec.add(point, [
                    bounds.width / 2,
                    bounds.height / 2,
                ]);

                const rotatedCenter = Vec.rotWith(
                    newCenter,
                    center,
                    shape.rotation || 0
                );

                point = Vec.sub(rotatedCenter, [
                    bounds.width / 2,
                    bounds.height / 2,
                ]);
            }

            const id = Utils.uniqueId();

            const clone = {
                ...shape,
                id,
                point,
            };

            // if (clone.type === TDShapeType.Sticky) {
            //     clone.text = '';
            // }

            return clone;
        }

        return;
    };

    /* ----------------- Event Handlers ----------------- */

    override onCancel = () => {
        if (this.app.pageState.editingId) {
            this.app.setEditingId();
        } else {
            this.select_none();
        }
        this.app.cancelSession();
        this.set_status(Status.Idle);
    };

    override onKeyDown: TLKeyboardEventHandler = (key, info, e) => {
        switch (key) {
            case 'Escape': {
                this.onCancel();
                break;
            }
            case 'Tab': {
                if (
                    !this.app.pageState.editingId &&
                    this.status === Status.Idle &&
                    this.app.selectedIds.length === 1
                ) {
                    const [selectedId] = this.app.selectedIds;
                    const clonedShape = this.getShapeClone(selectedId, 'right');

                    if (clonedShape) {
                        this.app.createShapes(clonedShape);
                        this.set_status(Status.Idle);
                        // if (clonedShape.type === TDShapeType.Sticky) {
                        //     this.app.select(clonedShape.id);
                        //     this.app.setEditingId(clonedShape.id);
                        // }
                    }
                }
                break;
            }
            case 'Meta':
            case 'Control':
            case 'Alt': {
                this.app.updateSession();
                break;
            }
            case 'Enter': {
                const { pageState } = this.app;
                if (
                    pageState.selectedIds.length === 1 &&
                    !pageState.editingId
                ) {
                    this.app.setEditingId(pageState.selectedIds[0]);
                    e.preventDefault();
                }
            }
        }
    };

    override onKeyUp: TLKeyboardEventHandler = (key, info) => {
        if (
            this.status === Status.ClonePainting &&
            !(info.altKey && info.shiftKey)
        ) {
            this.set_status(Status.Idle);
            return;
        }

        /* noop */
        if (key === 'Meta' || key === 'Control' || key === 'Alt') {
            this.app.updateSession();
            return;
        }
    };

    // Keyup is handled on BaseTool

    // Pointer Events (generic)

    override onPointerMove: TLPointerEventHandler = (info, e) => {
        const { originPoint, currentPoint } = this.app;

        switch (this.status) {
            case Status.PointingBoundsHandle: {
                if (!this.pointedBoundsHandle)
                    throw Error('No pointed bounds handle');
                if (Vec.dist(originPoint, currentPoint) > DEAD_ZONE) {
                    if (this.pointedBoundsHandle === 'rotate') {
                        // Stat a rotate session
                        this.set_status(Status.Rotating);
                        this.app.startSession(SessionType.Rotate);
                    } else if (
                        this.pointedBoundsHandle === 'center' ||
                        this.pointedBoundsHandle === 'left' ||
                        this.pointedBoundsHandle === 'right'
                    ) {
                        this.set_status(Status.Translating);
                        this.app.startSession(
                            SessionType.Translate,
                            false,
                            this.pointedBoundsHandle
                        );
                    } else {
                        // Stat a transform session
                        this.set_status(Status.Transforming);
                        const idsToTransform = this.app.selectedIds.flatMap(
                            id =>
                                TLDR.get_document_branch(
                                    this.app.state,
                                    id,
                                    this.app.currentPageId
                                )
                        );
                        if (idsToTransform.length === 1) {
                            // if only one shape is selected, transform single
                            this.app.startSession(
                                SessionType.TransformSingle,
                                idsToTransform[0],
                                this.pointedBoundsHandle
                            );
                        } else {
                            // otherwise, transform
                            this.app.startSession(
                                SessionType.Transform,
                                this.pointedBoundsHandle
                            );
                        }
                    }

                    // Also update the session with the current point
                    this.app.updateSession();
                }
                break;
            }
            case Status.PointingCanvas: {
                if (Vec.dist(originPoint, currentPoint) > DEAD_ZONE) {
                    this.app.startSession(SessionType.Brush);
                    this.set_status(Status.Brushing);
                }
                break;
            }
            case Status.PointingClone: {
                if (Vec.dist(originPoint, currentPoint) > DEAD_ZONE) {
                    this.set_status(Status.TranslatingClone);
                    this.app.startSession(SessionType.Translate);
                    this.app.updateSession();
                }
                break;
            }
            case Status.PointingBounds: {
                if (Vec.dist(originPoint, currentPoint) > DEAD_ZONE) {
                    this.set_status(Status.Translating);
                    this.app.startSession(SessionType.Translate);
                    this.app.updateSession();
                }
                break;
            }
            case Status.PointingHandle: {
                if (Vec.dist(originPoint, currentPoint) > DEAD_ZONE) {
                    this.set_status(Status.TranslatingHandle);
                    const selectedShape = this.app.getShape(
                        this.app.selectedIds[0]
                    );
                    if (selectedShape) {
                        if (this.pointedHandleId === 'bend') {
                            this.app.startSession(
                                SessionType.Handle,
                                selectedShape.id,
                                this.pointedHandleId
                            );
                            this.app.updateSession();
                        } else {
                            this.app.startSession(
                                SessionType.Arrow,
                                selectedShape.id,
                                this.pointedHandleId,
                                false
                            );
                            this.app.updateSession();
                        }
                    }
                }
                break;
            }
            case Status.ClonePainting: {
                this.clonePaint(currentPoint);
                break;
            }
            default: {
                if (this.app.session) {
                    this.app.updateSession();
                    break;
                }
            }
        }
    };

    override onPointerDown: TLPointerEventHandler = (info, e) => {
        if (info.target === 'canvas' && this.status === Status.Idle) {
            const { currentPoint } = this.app;

            if (info.spaceKey && e.buttons === 1) return;

            if (this.status === Status.Idle && info.altKey && info.shiftKey) {
                this.set_status(Status.ClonePainting);
                this.clonePaint(currentPoint);
                return;
            }

            // Unless the user is holding shift or meta, clear the current selection
            if (!info.shiftKey) {
                this.app.onShapeBlur();

                if (info.altKey && this.app.selectedIds.length > 0) {
                    this.app.duplicate(this.app.selectedIds, currentPoint);
                    return;
                }

                this.select_none();
            }

            this.set_status(Status.PointingCanvas);
        }
    };

    override onPointerUp: TLPointerEventHandler = info => {
        if (
            this.status === Status.TranslatingClone ||
            this.status === Status.PointingClone
        ) {
            if (this.pointedId) {
                this.app.completeSession();
                this.app.setEditingId(this.pointedId);
            }
            this.set_status(Status.Idle);
            this.pointedId = undefined;
            return;
        }

        if (this.status === Status.PointingBounds) {
            if (info.target === 'bounds') {
                // If we just clicked the selecting bounds's background,
                // clear the selection
                this.select_none();
            } else if (this.app.isSelected(info.target)) {
                // If we're holding shift...
                if (info.shiftKey) {
                    // unless we just shift-selected the shape, remove it from
                    // the selected shapes
                    if (this.pointedId !== info.target) {
                        this.deselect(info.target);
                    }
                } else {
                    // If we have other selected shapes, select this one instead
                    if (
                        this.pointedId !== info.target &&
                        this.app.selectedIds.length > 1
                    ) {
                        this.select(info.target);
                    }
                }
            } else if (this.pointedId === info.target) {
                if (this.app.getShape(info.target).isLocked) return;
                // If the target is not selected and was just pointed
                // on pointer down...
                if (info.shiftKey) {
                    this.push_select(info.target);
                } else {
                    this.select(info.target);
                }
            }
        }

        // Complete the current session, if any; and reset the status
        this.app.completeSession();
        this.set_status(Status.Idle);
        this.pointedBoundsHandle = undefined;
        this.pointedHandleId = undefined;
        this.pointedId = undefined;
    };

    // Canvas

    override onDoubleClickCanvas: TLCanvasEventHandler = () => {
        // Needs debugging
        // const { currentPoint } = this.app
        // this.app.selectTool(TDShapeType.Text)
        // this.setStatus(Status.Idle)
        // this.app.createTextShapeAtPoint(currentPoint)
    };

    // Shape
    override onPointShape: TLPointerEventHandler = (info, e) => {
        if (info.spaceKey && e.buttons === 1) return;

        if (this.app.getShape(info.target).isLocked) return;

        const { editingId, hoveredId } = this.app.pageState;

        if (editingId && info.target !== editingId) {
            this.app.onShapeBlur();
        }

        // While holding command and shift, select or deselect
        // the shape, ignoring any group that may contain it. Yikes!
        if (
            (this.status === Status.Idle ||
                this.status === Status.PointingBounds) &&
            info.metaKey &&
            info.shiftKey &&
            hoveredId
        ) {
            this.pointedId = hoveredId;

            if (this.app.isSelected(hoveredId)) {
                this.deselect(hoveredId);
            } else {
                this.push_select(hoveredId);
                this.set_status(Status.PointingBounds);
            }

            return;
        }

        if (this.status === Status.PointingBounds) {
            // The pointed id should be the shape's group, if it belongs
            // to a group, or else the shape itself, if it is on the page.
            const { parentId } = this.app.getShape(info.target);
            this.pointedId =
                parentId === this.app.currentPageId ? info.target : parentId;
            return;
        }

        if (this.status === Status.Idle) {
            this.set_status(Status.PointingBounds);
            if (info.metaKey) {
                if (!info.shiftKey) {
                    this.select_none();
                }

                this.app.startSession(SessionType.Brush);

                this.set_status(Status.Brushing);
                return;
            }

            // If we've clicked on a shape that is inside of a group,
            // then select the group rather than the shape.
            let shapeIdToSelect: string;
            const { parentId } = this.app.getShape(info.target);

            // If the pointed shape is a child of the page, select the
            // target shape and clear the selected group id.
            if (parentId === this.app.currentPageId) {
                shapeIdToSelect = info.target;
                this.selectedGroupId = undefined;
            } else {
                // If the parent is some other group...
                if (parentId === this.selectedGroupId) {
                    // If that group is the selected group, then select
                    // the target shape.
                    shapeIdToSelect = info.target;
                } else {
                    // Otherwise, select the group and clear the selected
                    // group id.
                    shapeIdToSelect = parentId;

                    this.selectedGroupId = undefined;
                }
            }

            if (!this.app.isSelected(shapeIdToSelect)) {
                // Set the pointed ID to the shape that was clicked.
                this.pointedId = shapeIdToSelect;

                // If the shape is not selected: then if the user is pressing shift,
                // add the shape to the current selection; otherwise, set the shape as
                // the only selected shape.
                if (info.shiftKey) {
                    this.push_select(shapeIdToSelect);
                } else {
                    this.select(shapeIdToSelect);
                }
            }
        }
    };

    override onDoubleClickShape: TLPointerEventHandler = info => {
        const shape = this.app.getShape(info.target);

        if (shape.isLocked) {
            this.app.select(info.target);
            return;
        }

        // If we can edit the shape (and if we can select the shape) then
        // start editing
        if (
            TLDR.get_shape_util(shape.type).canEdit &&
            (shape.parentId === this.app.currentPageId ||
                shape.parentId === this.selectedGroupId)
        ) {
            this.app.setEditingId(info.target);
        }

        // If the shape is the child of a group, then drill into the group?
        if (shape.parentId !== this.app.currentPageId) {
            this.selectedGroupId = shape.parentId;
        }
        this.app.select(info.target);
    };

    override onRightPointShape: TLPointerEventHandler = info => {
        if (!this.app.isSelected(info.target)) {
            this.app.select(info.target);
        }
    };

    override onHoverShape: TLPointerEventHandler = info => {
        this.app.setHoveredId(info.target);
    };

    override onUnhoverShape: TLPointerEventHandler = info => {
        const { currentPageId: oldCurrentPageId } = this.app;

        // Wait a frame; and if we haven't changed the hovered id,
        // clear the current hovered id
        requestAnimationFrame(() => {
            if (
                oldCurrentPageId === this.app.currentPageId &&
                this.app.pageState.hoveredId === info.target
            ) {
                this.app.setHoveredId(undefined);
            }
        });
    };

    /* --------------------- Bounds --------------------- */

    override onPointBounds: TLBoundsEventHandler = info => {
        if (info.metaKey) {
            if (!info.shiftKey) {
                this.select_none();
            }

            this.app.startSession(SessionType.Brush);

            this.set_status(Status.Brushing);
            return;
        }

        this.set_status(Status.PointingBounds);
    };

    override onRightPointBounds: TLPointerEventHandler = (info, e) => {
        e.stopPropagation();
    };

    override onReleaseBounds: TLBoundsEventHandler = () => {
        if (
            this.status === Status.Translating ||
            this.status === Status.Brushing
        ) {
            this.app.completeSession();
        }

        this.set_status(Status.Idle);
    };

    /* ----------------- Bounds Handles ----------------- */

    override onPointBoundsHandle: TLBoundsHandleEventHandler = info => {
        this.pointedBoundsHandle = info.target;
        this.set_status(Status.PointingBoundsHandle);
    };

    override onDoubleClickBoundsHandle: TLBoundsHandleEventHandler = info => {
        switch (info.target) {
            case 'center':
            case 'left':
            case 'right': {
                this.app.select(
                    ...TLDR.get_linked_shape_ids(
                        this.app.state,
                        this.app.currentPageId,
                        info.target,
                        info.shiftKey
                    )
                );
                break;
            }
            default: {
                if (this.app.selectedIds.length === 1) {
                    this.app.resetBounds(this.app.selectedIds);
                    const shape = this.app.getShape(this.app.selectedIds[0]);
                    if ('label' in shape) {
                        this.app.setEditingId(shape.id);
                    }
                }
            }
        }
    };

    override onReleaseBoundsHandle: TLBoundsHandleEventHandler = () => {
        this.set_status(Status.Idle);
    };

    /* --------------------- Handles -------------------- */

    override onPointHandle: TLPointerEventHandler = info => {
        this.pointedHandleId = info.target as 'start' | 'end';
        this.set_status(Status.PointingHandle);
    };

    override onDoubleClickHandle: TLPointerEventHandler = info => {
        if (info.target === 'bend') {
            const { selectedIds } = this.app;
            if (selectedIds.length !== 1) return;
            const shape = this.app.getShape(selectedIds[0]);
            if (
                TLDR.get_shape_util(shape.type).canEdit &&
                (shape.parentId === this.app.currentPageId ||
                    shape.parentId === this.selectedGroupId)
            ) {
                this.app.setEditingId(shape.id);
            }
            return;
        }

        this.app.toggleDecoration(info.target);
    };

    override onReleaseHandle: TLPointerEventHandler = () => {
        this.set_status(Status.Idle);
    };

    /* ---------------------- Misc ---------------------- */

    override onShapeClone: TLShapeCloneHandler = info => {
        const selectedShapeId = this.app.selectedIds[0];

        const clonedShape = this.getShapeClone(selectedShapeId, info.target);

        if (
            info.target === 'left' ||
            info.target === 'right' ||
            info.target === 'top' ||
            info.target === 'bottom'
        ) {
            if (clonedShape) {
                this.app.createShapes(clonedShape);

                // Now start pointing the bounds, so that a user can start
                // dragging to reposition if they wish.
                this.pointedId = clonedShape.id;
                this.set_status(Status.PointingClone);
            }
        } else {
            this.set_status(Status.GridCloning);
            this.app.startSession(SessionType.Grid, selectedShapeId);
        }
    };
}
