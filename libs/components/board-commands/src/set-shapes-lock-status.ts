import type {
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function setShapesLockStatus<T extends TDShape>(
    app: TldrawApp,
    ids: string[],
    isLocked: boolean
): TldrawCommand {
    const { currentPageId, selectedIds } = app;

    const initialShapes = ids.map(id => app.getShape<T>(id));

    const before: Record<string, Partial<TDShape>> = {};
    const after: Record<string, Partial<TDShape>> = {};

    initialShapes.forEach(shape => {
        before[shape.id] = {
            isLocked: shape.isLocked,
        };
        after[shape.id] = {
            isLocked,
        };
    });

    return {
        id: 'set_shapes_lock_status',
        before: {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: before,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds,
                    },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: after,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds,
                    },
                },
            },
        },
    };
}
