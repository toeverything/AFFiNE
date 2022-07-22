import type {
    TldrawCommand,
    TDPage,
} from '@toeverything/components/board-types';
import { Utils, TLPageState } from '@tldraw/core';
import type { TldrawApp } from '@toeverything/components/board-state';

export function createPage(
    app: TldrawApp,
    center: number[],
    pageId = Utils.uniqueId()
): TldrawCommand {
    const { currentPageId } = app;

    const topPage = Object.values(app.state.document.pages).sort(
        (a, b) => (b.childIndex || 0) - (a.childIndex || 0)
    )[0];

    const nextChildIndex = topPage?.childIndex ? topPage?.childIndex + 1 : 1;

    // TODO: Iterate the name better
    const nextName = `New Page`;

    const page: TDPage = {
        id: pageId,
        name: nextName,
        childIndex: nextChildIndex,
        shapes: {},
        bindings: {},
    };

    const pageState: TLPageState = {
        id: pageId,
        selectedIds: [],
        camera: { point: center, zoom: 1 },
        editingId: undefined,
        bindingId: undefined,
        hoveredId: undefined,
        pointedId: undefined,
    };

    return {
        id: 'create_page',
        before: {
            appState: {
                currentPageId,
            },
            document: {
                pages: {
                    [pageId]: undefined,
                },
                pageStates: {
                    [pageId]: undefined,
                },
            },
        },
        after: {
            appState: {
                currentPageId: page.id,
            },
            document: {
                pages: {
                    [pageId]: page,
                },
                pageStates: {
                    [pageId]: pageState,
                },
            },
        },
    };
}
