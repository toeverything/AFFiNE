import type { TldrawCommand } from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function deletePage(app: TldrawApp, pageId: string): TldrawCommand {
    const {
        currentPageId,
        document: { pages, pageStates },
    } = app;

    const pagesArr = Object.values(pages).sort(
        (a, b) => (a.childIndex || 0) - (b.childIndex || 0)
    );

    const currentIndex = pagesArr.findIndex(page => page.id === pageId);

    let nextCurrentPageId: string;

    if (pageId === currentPageId) {
        if (currentIndex === pagesArr.length - 1) {
            nextCurrentPageId = pagesArr[pagesArr.length - 2].id;
        } else {
            nextCurrentPageId = pagesArr[currentIndex + 1].id;
        }
    } else {
        nextCurrentPageId = currentPageId;
    }

    return {
        id: 'delete_page',
        before: {
            appState: {
                currentPageId: pageId,
            },
            document: {
                pages: {
                    [pageId]: { ...pages[pageId] },
                },
                pageStates: {
                    [pageId]: { ...pageStates[pageId] },
                },
            },
        },
        after: {
            appState: {
                currentPageId: nextCurrentPageId,
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
    };
}
