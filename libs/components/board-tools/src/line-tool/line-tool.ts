import { Utils, TLPointerEventHandler } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { Arrow } from '@toeverything/components/board-shapes';
import { SessionType, TDShapeType } from '@toeverything/components/board-types';
import { BaseTool, BaseToolStatus } from '@toeverything/components/board-state';

export class LineTool extends BaseTool {
    override type = TDShapeType.Line as const;

    /* ----------------- Event Handlers ----------------- */

    override onPointerDown: TLPointerEventHandler = () => {
        if (this.status !== BaseToolStatus.Idle) return;

        const {
            currentPoint,
            currentGrid,
            settings: { showGrid },
            appState: { currentPageId, currentStyle },
            document: { id: workspace },
        } = this.app;

        const childIndex = this.getNextChildIndex();
        const id = Utils.uniqueId();

        const newShape = Arrow.create({
            id,
            parentId: currentPageId,
            childIndex,
            point: showGrid
                ? Vec.snap(currentPoint, currentGrid)
                : currentPoint,
            decorations: {
                start: undefined,
                end: undefined,
            },
            style: { ...currentStyle },
            workspace,
        });

        this.app.patchCreate([newShape]);

        this.app.startSession(SessionType.Arrow, newShape.id, 'end', true);

        this.set_status(BaseToolStatus.Creating);
    };
}
