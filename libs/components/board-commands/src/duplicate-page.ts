import type { TldrawCommand } from '@toeverything/components/board-types';
import { Utils } from '@tldraw/core';
import type { TldrawApp } from '@toeverything/components/board-state';

export function duplicatePage(app: TldrawApp, pageId: string): TldrawCommand {
    const newId = Utils.uniqueId();
    const {
        currentPageId,
        page,
        pageState: { camera },
    } = app;

    const nextPage = {
        ...page,
        id: newId,
        name: page.name + ' Copy',
        shapes: Object.fromEntries(
            Object.entries(page.shapes).map(([id, shape]) => {
                return [
                    id,
                    {
                        ...shape,
                        parentId:
                            shape.parentId === pageId ? newId : shape.parentId,
                    },
                ];
            })
        ),
    };

    return {
        id: 'duplicate_page',
        before: {
            appState: {
                currentPageId,
            },
            document: {
                pages: {
                    [newId]: undefined,
                },
                pageStates: {
                    [newId]: undefined,
                },
            },
        },
        after: {
            appState: {
                currentPageId: newId,
            },
            document: {
                pages: {
                    [newId]: nextPage,
                },
                pageStates: {
                    [newId]: {
                        ...page,
                        id: newId,
                        selectedIds: [],
                        camera: { ...camera },
                        editingId: undefined,
                        bindingId: undefined,
                        hoveredId: undefined,
                        pointedId: undefined,
                    },
                },
            },
        },
    };
}
