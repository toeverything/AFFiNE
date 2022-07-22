import { Utils, TLPointerEventHandler } from '@tldraw/core';
import { Draw } from '@toeverything/components/board-shapes';
import { SessionType, TDShapeType } from '@toeverything/components/board-types';
import { BaseTool } from '@toeverything/components/board-state';

enum Status {
    Idle = 'idle',
    Creating = 'creating',
    Extending = 'extending',
    Pinching = 'pinching',
}

export class DrawTool extends BaseTool {
    override type = TDShapeType.Draw as const;

    private last_shape_id?: string;

    override onEnter = () => {
        this.last_shape_id = undefined;
    };

    override onCancel = () => {
        switch (this.status) {
            case Status.Idle: {
                this.app.selectTool('select');
                break;
            }
            default: {
                this.set_status(Status.Idle);
                break;
            }
        }

        this.app.cancelSession();
    };

    /* ----------------- Event Handlers ----------------- */

    override onPointerDown: TLPointerEventHandler = info => {
        if (this.status !== Status.Idle) return;
        const {
            currentPoint,
            appState: { currentPageId, currentStyle },
            document: { id: workspace },
        } = this.app;
        const previous =
            this.last_shape_id && this.app.getShape(this.last_shape_id);
        if (info.shiftKey && previous) {
            // Extend the previous shape
            this.app.startSession(SessionType.Draw, previous.id);
            this.set_status(Status.Extending);
        } else {
            // Create a new shape

            const childIndex = this.getNextChildIndex();
            const id = Utils.uniqueId();

            const newShape = Draw.create({
                id,
                parentId: currentPageId,
                childIndex,
                point: currentPoint,
                style: { ...currentStyle },
                workspace,
            });
            this.last_shape_id = id;
            this.app.patchCreate([newShape]);
            this.app.startSession(SessionType.Draw, id);
            this.set_status(Status.Creating);
        }
    };

    override onPointerMove: TLPointerEventHandler = () => {
        switch (this.status) {
            case Status.Extending:
            case Status.Creating: {
                this.app.updateSession();
            }
        }
    };

    override onPointerUp: TLPointerEventHandler = () => {
        this.app.completeSession();
        this.set_status(Status.Idle);
    };
}
