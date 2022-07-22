import { Utils, TLPointerEventHandler, TLBoundsCorner } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { Pentagram } from '@toeverything/components/board-shapes';
import { SessionType, TDShapeType } from '@toeverything/components/board-types';
import { BaseTool, BaseToolStatus } from '@toeverything/components/board-state';

export class PentagramTool extends BaseTool {
    override type = TDShapeType.Pentagram as const;

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

        const newShape = Pentagram.create({
            id,
            parentId: currentPageId,
            childIndex,
            point: showGrid
                ? Vec.snap(currentPoint, currentGrid)
                : currentPoint,
            style: { ...currentStyle },
            workspace,
        });

        this.app.patchCreate([newShape]);

        this.app.startSession(
            SessionType.TransformSingle,
            newShape.id,
            TLBoundsCorner.BottomRight,
            true
        );

        this.set_status(BaseToolStatus.Creating);
    };
}
