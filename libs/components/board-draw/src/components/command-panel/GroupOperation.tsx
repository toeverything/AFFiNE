import { TLDR, TldrawApp } from '@toeverything/components/board-state';
import { TDShape, TDShapeType } from '@toeverything/components/board-types';
import { GroupIcon, UngroupIcon } from '@toeverything/components/icons';
import { IconButton, Tooltip } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { getShapeIds } from './utils';

interface GroupAndUnGroupProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const Group = ({ app, shapes }: GroupAndUnGroupProps) => {
    const group = async () => {
        let groupShape = await services.api.editorBlock.create({
            workspace: app.document.id,
            parentId: app.appState.currentPageId,
            type: 'shape',
        });
        await services.api.editorBlock.update({
            workspace: groupShape.workspace,
            id: groupShape.id,
            properties: {
                shapeProps: {
                    value: JSON.stringify(
                        TLDR.get_shape_util(TDShapeType.Group).create({
                            id: groupShape.id,
                            affineId: groupShape.id,
                            childIndex: 1,
                            parentId: app.appState.currentPageId,
                            point: [0, 0],
                            size: [0, 0],
                            children: getShapeIds(shapes),
                            workspace: app.document.id,
                        })
                    ),
                },
            },
        });

        app.group(
            getShapeIds(shapes),
            groupShape.id,
            app.appState.currentPageId
        );
    };
    return (
        <Tooltip content="Group">
            <IconButton onClick={group}>
                <GroupIcon />
            </IconButton>
        </Tooltip>
    );
};

export const UnGroup = ({ app, shapes }: GroupAndUnGroupProps) => {
    const ungroup = () => {
        app.ungroup(getShapeIds(shapes));
    };

    return (
        <Tooltip content="Ungroup">
            <IconButton onClick={ungroup}>
                <UngroupIcon />
            </IconButton>
        </Tooltip>
    );
};
