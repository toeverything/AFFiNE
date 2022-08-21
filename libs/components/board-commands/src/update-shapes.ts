import type { TldrawApp } from '@toeverything/components/board-state';
import { TLDR } from '@toeverything/components/board-state';
import type {
    TDShape,
    TldrawCommand,
} from '@toeverything/components/board-types';

export function updateShapes(
    app: TldrawApp,
    updates: ({ id: string } & Partial<TDShape>)[],
    pageId: string
): TldrawCommand {
    const ids = updates.map(update => update.id);

    const change = TLDR.mutate_shapes(
        app.state,
        ids.filter(id => !app.getShape(id, pageId).isLocked),
        (shape, i) => updates[i],
        pageId
    );

    return {
        id: 'update',
        before: {
            document: {
                pages: {
                    [pageId]: {
                        shapes: change.before,
                    },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [pageId]: {
                        shapes: change.after,
                    },
                },
            },
        },
    };
}
