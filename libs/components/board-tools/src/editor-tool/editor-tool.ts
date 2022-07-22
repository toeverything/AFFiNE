/* eslint-disable no-restricted-syntax */
import { TLPointerEventHandler } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { Editor } from '@toeverything/components/board-shapes';
import { TDShapeType } from '@toeverything/components/board-types';
import { BaseTool, BaseToolStatus } from '@toeverything/components/board-state';
import { services } from '@toeverything/datasource/db-service';

export class EditorTool extends BaseTool {
    override type = TDShapeType.Editor as const;

    /* ----------------- Event Handlers ----------------- */

    // It is not allowed to drag and drop the size when it is created, it is directly treated as a click event, and the Group is created asynchronously
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

        const createGroup = async () => {
            this.set_status(BaseToolStatus.Creating);
            const group = await services.api.editorBlock.create({
                workspace,
                type: 'group',
                parentId: currentPageId,
            });
            await services.api.editorBlock.create({
                workspace,
                type: 'text',
                parentId: group.id,
            });
            const newShape = Editor.create({
                id: group.id,
                rootBlockId: group.id,
                affineId: group.id,
                parentId: currentPageId,
                childIndex,
                point: showGrid
                    ? Vec.snap(currentPoint, currentGrid)
                    : currentPoint,
                style: { ...currentStyle },
                workspace,
            });
            // In order to make the cursor just positioned at the beginning of the first line, it needs to be adjusted according to the padding            newShape.point = Vec.sub(newShape.point, [50, 30]);
            this.app.patchCreate([newShape]);
            this.app.select(group.id);
            this.app.setEditingId(group.id);
            this.set_status(BaseToolStatus.Idle);
            this.app.selectTool('select');
        };
        createGroup();
    };
}
