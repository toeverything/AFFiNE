import type { BlockClientInstance } from '@toeverything/datasource/jwt';
import { PAGE_TREE as pageTreeName } from '../../utils';
import { ServiceBaseClass } from '../base';
import type { ReturnUnobserve } from '../database/observer';
import { TreeItem } from './types';

export type ObserveCallback = () => void;

export class PageTree extends ServiceBaseClass {
    private async _fetchPageTree<TreeItem>(workspace: string) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        const pageTreeConfig =
            workspaceDbBlock.getDecoration<TreeItem[]>(pageTreeName);
        return pageTreeConfig;
    }

    async getPageTree<TreeItem>(workspace: string): Promise<TreeItem[]> {
        try {
            const pageTree = await this._fetchPageTree(workspace);
            if (pageTree && pageTree.length) {
                const db = await this.database.getDatabase(workspace);

                const pages = await _updateTreeItemsTitle(
                    db,
                    pageTree as [],
                    {}
                );
                return pages;
            }
        } catch (e) {
            console.error(e);
        }

        return [];
    }

    /** @deprecated should implement more fine-grained crud methods instead of replacing each time with a new array */
    async setPageTree<TreeItem>(workspace: string, treeData: TreeItem[]) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        workspaceDbBlock.setDecoration(pageTreeName, treeData);
    }

    async addPage<TreeItem>(workspace: string, treeData: TreeItem[] | string) {
        // TODO: rewrite
        if (typeof treeData === 'string') {
            await this.setPageTree(workspace, [{ id: treeData, children: [] }]);
        }
    }
    async removePage(workspace: string, blockId: string) {
        const dbBlock = await this.getBlock(workspace, blockId);
        await dbBlock?.remove();
    }

    async addPageToWorkspacee(targetWorkspaceId: string, newPageId: string) {
        const items = await this.getPageTree<TreeItem>(targetWorkspaceId);
        await this.setPageTree(targetWorkspaceId, [
            { id: newPageId, children: [] },
            ...items,
        ]);
    }

    async addChildPageToWorkspace(
        targetWorkspaceId: string,
        parentPageId: string,
        newPageId: string
    ) {
        const pages = await this.getPageTree<TreeItem>(targetWorkspaceId);
        this._buildItemsForChildPage(parentPageId, newPageId, pages);

        await this.setPageTree<TreeItem>(targetWorkspaceId, [...pages]);
    }
    async addPrevPageToWorkspace(
        targetWorkspaceId: string,
        parentPageId: string,
        newPageId: string
    ) {
        const pages = await this.getPageTree<TreeItem>(targetWorkspaceId);
        this._buildItemsForPrevPage(parentPageId, newPageId, pages);
        await this.setPageTree<TreeItem>(targetWorkspaceId, [...pages]);
    }
    async addNextPageToWorkspace(
        targetWorkspaceId: string,
        parentPageId: string,
        newPageId: string
    ) {
        const pages = await this.getPageTree<TreeItem>(targetWorkspaceId);
        this._buildItemsForNextPage(parentPageId, newPageId, pages);
        await this.setPageTree<TreeItem>(targetWorkspaceId, [...pages]);
    }
    private _buildItemsForNextPage(
        parentPageId: string,
        newPageId: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const childPage = children[i];
            if (childPage.id === parentPageId) {
                const newPage = {
                    id: newPageId,
                    title: 'Untitled',
                    children: [] as TreeItem[],
                };
                children = children.splice(i + 1, 0, newPage);
            } else if (childPage.children && childPage.children.length) {
                this._buildItemsForNextPage(
                    parentPageId,
                    newPageId,
                    childPage.children
                );
            }
        }
    }
    private _buildItemsForPrevPage(
        parentPageId: string,
        newPageId: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const childPage = children[i];
            if (childPage.id === parentPageId) {
                const newPage = {
                    id: newPageId,
                    title: 'Untitled',
                    children: [] as TreeItem[],
                };
                children = children.splice(i - 1, 0, newPage);
            } else if (childPage.children && childPage.children.length) {
                this._buildItemsForPrevPage(
                    parentPageId,
                    newPageId,
                    childPage.children
                );
            }
        }
    }
    private _buildItemsForChildPage(
        parentPageId: string,
        newPageId: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const childPage = children[i];
            if (childPage.id === parentPageId) {
                childPage.children = childPage.children || [];
                childPage.children.push({
                    id: newPageId,
                    title: 'Untitled',
                    children: [],
                });
            } else if (childPage.children && childPage.children.length) {
                this._buildItemsForChildPage(
                    parentPageId,
                    newPageId,
                    childPage.children
                );
            }
        }
    }
    // TODO: handles unobserve
    async observe(
        { workspace, page }: { workspace: string; page: string },
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        const unobserveWorkspace = await this._observe(
            workspace,
            workspaceDbBlock.id,
            (states, block) => {
                callback();
            }
        );
        const unobservePage = await this._observe(
            workspace,
            page,
            (states, block) => {
                callback();
            }
        );

        return () => {
            unobserveWorkspace();
            unobservePage();
        };
    }

    async unobserve({ workspace }: { workspace: string }) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        await this._unobserve(workspace, workspaceDbBlock.id);
    }
}

async function _updateTreeItemsTitle<
    TreeItem extends { id: string; title: string; children: TreeItem[] }
>(
    db: BlockClientInstance,
    items: TreeItem[],
    cache: Record<string, string>
): Promise<TreeItem[]> {
    for (const item of items) {
        if (cache[item.id]) {
            item.title = cache[item.id];
        } else {
            const page = await db.get(item.id as 'page');
            item.title =
                page
                    .getDecoration<{ value: Array<{ text: string }> }>('text')
                    ?.value?.map(v => v.text)
                    .join('') || 'Untitled';
            cache[item.id] = item.title;
        }

        if (item.children.length) {
            item.children = await _updateTreeItemsTitle(
                db,
                item.children,
                cache
            );
        }
    }

    return [...items];
}
