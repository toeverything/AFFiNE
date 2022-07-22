import type {
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function toggleShapesProp(
    app: TldrawApp,
    ids: string[],
    prop: keyof TDShape
): TldrawCommand {
    const { currentPageId } = app;

    const initialShapes = ids
        .map(id => app.getShape(id))
        .filter(shape => (prop === 'isLocked' ? true : !shape.isLocked));

    const isAllToggled = initialShapes.every(shape => shape[prop]);

    const before: Record<string, Partial<TDShape>> = {};
    const after: Record<string, Partial<TDShape>> = {};

    initialShapes.forEach(shape => {
        before[shape.id] = { [prop]: shape[prop] };
        after[shape.id] = { [prop]: !isAllToggled };
    });

    return {
        id: 'toggle',
        before: {
            document: {
                pages: {
                    [currentPageId]: {
                        shapes: before,
                    },
                },
                pageStates: {
                    [currentPageId]: {
                        selectedIds: ids,
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
                        selectedIds: ids,
                    },
                },
            },
        },
    };
}
