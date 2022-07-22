import type {
    TDAsset,
    TDAssets,
    TldrawCommand,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';
import { removeShapesFromPage } from './shared/remove-shapes-from-page';

const removeAssetsFromDocument = (assets: TDAssets, idsToRemove: string[]) => {
    const afterAssets: Record<string, TDAsset | undefined> = { ...assets };
    idsToRemove.forEach(id => (afterAssets[id] = undefined));
    return afterAssets;
};

export function deleteShapes(
    app: TldrawApp,
    ids: string[],
    pageId = app.currentPageId
): TldrawCommand {
    const {
        pageState,
        selectedIds,
        document: { assets: beforeAssets },
    } = app;
    const { before, after, assetsToRemove } = removeShapesFromPage(
        app.state,
        ids,
        pageId
    );
    const afterAssets = removeAssetsFromDocument(beforeAssets, assetsToRemove);

    return {
        id: 'delete',
        before: {
            document: {
                assets: beforeAssets,
                pages: {
                    [pageId]: before,
                },
                pageStates: {
                    [pageId]: { selectedIds: [...app.selectedIds] },
                },
            },
        },
        after: {
            document: {
                assets: afterAssets,
                pages: {
                    [pageId]: after,
                },
                pageStates: {
                    [pageId]: {
                        selectedIds: selectedIds.filter(
                            id => !ids.includes(id)
                        ),
                        hoveredId:
                            pageState.hoveredId &&
                            ids.includes(pageState.hoveredId)
                                ? undefined
                                : pageState.hoveredId,
                    },
                },
            },
        },
    };
}
