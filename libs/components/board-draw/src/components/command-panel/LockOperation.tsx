import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { IconButton, Tooltip } from '@toeverything/components/ui';
import { LockIcon, UnlockIcon } from '@toeverything/components/icons';
import { getShapeIds } from './utils';

interface GroupAndUnGroupProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const Lock = ({ app, shapes }: GroupAndUnGroupProps) => {
    const lock = () => {
        app.lock(getShapeIds(shapes));
    };
    return (
        <Tooltip content="Lock">
            <IconButton onClick={lock}>
                <UnlockIcon />
            </IconButton>
        </Tooltip>
    );
};

export const Unlock = ({ app, shapes }: GroupAndUnGroupProps) => {
    const unlock = () => {
        app.unlock(getShapeIds(shapes));
    };

    return (
        <Tooltip content="Unlock">
            <IconButton onClick={unlock}>
                <LockIcon />
            </IconButton>
        </Tooltip>
    );
};
