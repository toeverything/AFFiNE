import { TLPointerEventHandler } from '@tldraw/core';
// import { Draw } from '@toeverything/components/board-shapes';
import { Vec } from '@tldraw/vec';

import { SessionType, TDShapeType } from '@toeverything/components/board-types';
import { BaseTool } from '@toeverything/components/board-state';

enum Status {
    Idle = 'idle',
    Pointing = 'pointing',
    Laser = 'laser',
}

export class LaserTool extends BaseTool {
    override type = TDShapeType.Laser as const;

    override status: Status = Status.Idle;

    /* ----------------- Event Handlers ----------------- */

    override onPointerDown: TLPointerEventHandler = () => {
        if (this.app.readOnly) return;
        if (this.status !== Status.Idle) return;

        this.set_status(Status.Pointing);
    };

    override onPointerMove: TLPointerEventHandler = info => {
        if (this.app.readOnly) return;
        switch (this.status) {
            case Status.Pointing: {
                if (Vec.dist(info.origin, info.point) > 3) {
                    this.app.startSession(SessionType.Laser);
                    this.app.updateSession();
                    this.set_status(Status.Laser);
                }
                break;
            }
            case Status.Laser: {
                this.app.updateSession();
            }
        }
    };

    override onPointerUp: TLPointerEventHandler = () => {
        if (this.app.readOnly) return;
        switch (this.status) {
            case Status.Laser: {
                this.app.completeSession();
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
