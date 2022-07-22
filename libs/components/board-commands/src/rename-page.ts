import type { TldrawCommand } from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export function renamePage(
    app: TldrawApp,
    pageId: string,
    name: string
): TldrawCommand {
    const { page } = app;

    return {
        id: 'rename_page',
        before: {
            document: {
                pages: {
                    [pageId]: { name: page.name },
                },
            },
        },
        after: {
            document: {
                pages: {
                    [pageId]: { name: name },
                },
            },
        },
    };
}
