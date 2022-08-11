import type { FC } from 'react';
import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { IconButton, Tooltip } from '@toeverything/components/ui';
import { DeleteCashBinIcon } from '@toeverything/components/icons';
import { getShapeIds } from './utils';

interface DeleteShapesProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const DeleteShapes = ({ app, shapes }: DeleteShapesProps) => {
    const deleteShapes = () => {
        app.delete(getShapeIds(shapes));
    };
    return (
        <Tooltip content="Delete">
            <IconButton onClick={deleteShapes}>
                <DeleteCashBinIcon />
            </IconButton>
        </Tooltip>
    );
};
