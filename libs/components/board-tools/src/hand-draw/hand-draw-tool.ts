// import { Draw } from '@toeverything/components/board-shapes';

import { BaseTool } from '@toeverything/components/board-state';
import { TDShapeType } from '@toeverything/components/board-types';

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
