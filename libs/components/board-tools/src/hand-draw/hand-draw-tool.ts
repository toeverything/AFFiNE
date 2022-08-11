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

    override onEnter = () => {
        this.app.patchState({
            settings: {
                forcePanning: true,
            },
        });
    };

    override onExit = () => {
        this.app.patchState({
            settings: {
                forcePanning: false,
            },
        });
    };
}
