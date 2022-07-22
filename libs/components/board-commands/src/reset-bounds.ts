import type { TldrawCommand } from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';
import type { TldrawApp } from '@toeverything/components/board-state';

export function resetBounds(
    app: TldrawApp,
    ids: string[],
    pageId: string
): TldrawCommand {
    const { currentPageId } = app;

    const { before, after } = TLDR.mutate_shapes(
        app.state,
        ids,
        shape => app.getShapeUtil(shape).onDoubleClickBoundsHandle?.(shape),
        pageId
    );

    return {
        id: 'reset_bounds',
        before: {
            document: {
                pages: {
                    [currentPageId]: { shapes: before },
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
                    [currentPageId]: { shapes: after },
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
