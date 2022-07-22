import {
    SessionType,
    TldrawCommand,
    TldrawPatch,
    TDStatus,
    RectangleShape,
    TriangleShape,
    EllipseShape,
    ArrowShape,
} from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import { BaseSession } from './base-session';
import type { TldrawApp } from '@toeverything/components/board-state';
import type { TLBounds } from '@tldraw/core';

export class TranslateLabelSession extends BaseSession {
    type = SessionType.Handle;
    performanceMode: undefined;
    status = TDStatus.TranslatingHandle;
    initialShape: RectangleShape | TriangleShape | EllipseShape | ArrowShape;
    initialShapeBounds: TLBounds;

    constructor(app: TldrawApp, shapeId: string) {
        super(app);
        this.initialShape = this.app.getShape<
            RectangleShape | TriangleShape | EllipseShape | ArrowShape
        >(shapeId);
        this.initialShapeBounds = this.app.getShapeBounds(shapeId);
    }

    start = (): TldrawPatch | undefined => void null;

    update = (): TldrawPatch | undefined => {
        const {
            initialShapeBounds,
            app: { currentPageId, currentPoint },
        } = this;

        const newHandlePoint = [
            Math.max(
                0,
                Math.min(1, currentPoint[0] / initialShapeBounds.width)
            ),
            Math.max(
                0,
                Math.min(1, currentPoint[1] / initialShapeBounds.height)
            ),
        ];

        // First update the handle's next point
        const change = {
            handlePoint: newHandlePoint,
        } as Partial<
            RectangleShape | TriangleShape | EllipseShape | ArrowShape
        >;

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: {
                            [this.initialShape.id]: change,
                        },
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

        return {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: {
                            [initialShape.id]: initialShape,
                        },
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

        return {
            before: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: {
                                [initialShape.id]: initialShape,
                            },
                        },
                    },
                },
            },
            after: {
                document: {
                    pages: {
                        [currentPageId]: {
                            shapes: {
                                [initialShape.id]: TLDR.on_session_complete(
                                    this.app.getShape(this.initialShape.id)
                                ),
                            },
                        },
                    },
                },
            },
        };
    };
}
