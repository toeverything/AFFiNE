import type { TLPointerEventHandler } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { BaseTool } from '@toeverything/components/board-state';
import { DEAD_ZONE, SessionType } from '@toeverything/components/board-types';

enum Status {
    Idle = 'idle',
    Pointing = 'pointing',
    Erasing = 'erasing',
}

export class EraseTool extends BaseTool {
    override type = 'erase' as const;

    override status: Status = Status.Idle;

    /* ----------------- Event Handlers ----------------- */

    override onPointerDown: TLPointerEventHandler = () => {
        if (this.status !== Status.Idle) return;

        this.set_status(Status.Pointing);
    };

    override onPointerMove: TLPointerEventHandler = info => {
        switch (this.status) {
            case Status.Pointing: {
                if (Vec.dist(info.origin, info.point) > DEAD_ZONE) {
                    this.app.startSession(SessionType.Erase);
                    this.app.updateSession();
                    this.set_status(Status.Erasing);
                }
                break;
            }
            case Status.Erasing: {
                this.app.updateSession();
            }
        }
    };

    override onPointerUp: TLPointerEventHandler = () => {
        switch (this.status) {
            case Status.Pointing: {
                const shapeIdsAtPoint = this.app.shapes
                    .filter(shape => !shape.isLocked)
                    .filter(shape =>
                        this.app
                            .getShapeUtil(shape)
                            .hitTestPoint(shape, this.app.currentPoint)
                    )
                    .flatMap(shape =>
                        shape.children
                            ? [shape.id, ...shape.children]
                            : shape.id
                    );

                this.app.delete(shapeIdsAtPoint);

                break;
            }
            case Status.Erasing: {
                this.app.completeSession();

                // Should the app go back to the previous state, the select
                // state, or stay in the eraser state?

                // if (this.previous) {
                //   this.app.selectTool(this.previous)
                // } else {
                //   this.app.selectTool('select')
                // }
            }
        }

        this.set_status(Status.Idle);
    };

    override onCancel = () => {
        if (this.status === Status.Idle) {
            if (this.previous) {
                this.app.selectTool(this.previous);
            } else {
                this.app.selectTool('select');
            }
        } else {
            this.set_status(Status.Idle);
        }

        this.app.cancelSession();
    };
}
