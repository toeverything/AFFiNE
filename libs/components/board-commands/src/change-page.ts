import type { TldrawApp } from '@toeverything/components/board-state';
import type { TldrawCommand } from '@toeverything/components/board-types';

export function changePage(app: TldrawApp, pageId: string): TldrawCommand {
    return {
        id: 'change_page',
        before: {
            appState: {
                currentPageId: app.currentPageId,
            },
        },
        after: {
            appState: {
                currentPageId: pageId,
            },
        },
    };
}
