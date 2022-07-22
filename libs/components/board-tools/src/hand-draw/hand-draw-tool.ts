import { TLPointerEventHandler } from '@tldraw/core';
// import { Draw } from '@toeverything/components/board-shapes';
import { Vec } from '@tldraw/vec';

import { TDShapeType } from '@toeverything/components/board-types';
import { BaseTool } from '@toeverything/components/board-state';

enum Status {
    Idle = 'idle',
    Pointing = 'pointing',
    Draw = 'draw',
}

export class HandDrawTool extends BaseTool {
    override type = TDShapeType.HandDraw as const;

    override status: Status = Status.Idle;

    /* ----------------- Event Handlers ----------------- */

    override onPointerDown: TLPointerEventHandler = () => {
        if (this.app.readOnly) return;
        if (this.status !== Status.Idle) return;

        this.set_status(Status.Pointing);
    };

    override onPointerMove: TLPointerEventHandler = (info, e) => {
        if (this.app.readOnly) return;
        const delta = Vec.div(info.delta, this.app.camera.zoom);
        const prev = this.app.camera.point;
        const next = Vec.sub(prev, delta);
        if (Vec.isEqual(next, prev)) return;

        switch (this.status) {
            case Status.Pointing: {
                this.app.pan(Vec.neg(delta));

                break;
            }
        }
    };

    override onPointerUp: TLPointerEventHandler = () => {
        this.set_status(Status.Idle);
    };

    override onCancel = () => {
        this.set_status(Status.Idle);
    };
}
