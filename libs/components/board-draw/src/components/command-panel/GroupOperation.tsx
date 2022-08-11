import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { IconButton, Tooltip } from '@toeverything/components/ui';
import { GroupIcon, UngroupIcon } from '@toeverything/components/icons';
import { getShapeIds } from './utils';

interface GroupAndUnGroupProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const Group = ({ app, shapes }: GroupAndUnGroupProps) => {
    const group = () => {
        app.group(getShapeIds(shapes));
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
