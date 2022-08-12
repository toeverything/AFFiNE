import type { TldrawApp } from '@toeverything/components/board-state';
import type {
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';

export function setShapesProps<T extends TDShape>(
    app: TldrawApp,
    ids: string[],
    partial: Partial<T>
): TldrawCommand {
    const { currentPageId, selectedIds } = app;

    const initialShapes = ids
        .map(id => app.getShape<T>(id))
        .filter(shape => (partial['isLocked'] ? true : !shape.isLocked));

    const before: Record<string, Partial<TDShape>> = {};
    const after: Record<string, Partial<TDShape>> = {};

    const keys = Object.keys(partial) as (keyof T)[];

    initialShapes.forEach(shape => {
        before[shape.id] = Object.fromEntries(
            keys.map(key => [key, shape[key]])
        );
        after[shape.id] = partial;
    });

    return {
        id: 'set_props',
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
