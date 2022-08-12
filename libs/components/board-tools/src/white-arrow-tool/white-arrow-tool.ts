import { TLBoundsCorner, TLPointerEventHandler, Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { WhiteArrow } from '@toeverything/components/board-shapes';
import { BaseTool, BaseToolStatus } from '@toeverything/components/board-state';
import { SessionType, TDShapeType } from '@toeverything/components/board-types';

export class WhiteArrowTool extends BaseTool {
    override type = TDShapeType.Triangle as const;

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

        const newShape = WhiteArrow.create({
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
