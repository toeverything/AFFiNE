import type { BlockClientInstance } from '@toeverything/datasource/jwt';
import { PAGE_TREE } from '../../utils';
import type { ReturnUnobserve } from '../database/observer';
import { ServiceBaseClass } from '../base';
import { TreeItem } from './types';

export type ObserveCallback = () => void;

export class PageTree extends ServiceBaseClass {
    private async fetch_page_tree<TreeItem>(workspace: string) {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        const page_tree_config =
            workspace_db_block.getDecoration<TreeItem[]>(PAGE_TREE);
        return page_tree_config;
    }

    async getPageTree<TreeItem>(workspace: string): Promise<TreeItem[]> {
        try {
            const page_tree = await this.fetch_page_tree(workspace);
            if (page_tree && page_tree.length) {
                const db = await this.database.getDatabase(workspace);

                const pages = await update_tree_items_title(
                    db,
                    page_tree as [],
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
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        workspace_db_block.setDecoration(PAGE_TREE, treeData);
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

    async addPageToWorkspacee(
        target_workspace_id: string,
        new_page_id: string
    ) {
        const items = await this.getPageTree<TreeItem>(target_workspace_id);
        await this.setPageTree(target_workspace_id, [
            { id: new_page_id, children: [] },
            ...items,
        ]);
    }

    async addChildPageToWorkspace(
        target_workspace_id: string,
        parent_page_id: string,
        new_page_id: string
    ) {
        const pages = await this.getPageTree<TreeItem>(target_workspace_id);
        this.build_items_for_child_page(parent_page_id, new_page_id, pages);

        await this.setPageTree<TreeItem>(target_workspace_id, [...pages]);
    }
    async addPrevPageToWorkspace(
        target_workspace_id: string,
        parent_page_id: string,
        new_page_id: string
    ) {
        const pages = await this.getPageTree<TreeItem>(target_workspace_id);
        this.build_items_for_prev_page(parent_page_id, new_page_id, pages);
        await this.setPageTree<TreeItem>(target_workspace_id, [...pages]);
    }
    async addNextPageToWorkspace(
        target_workspace_id: string,
        parent_page_id: string,
        new_page_id: string
    ) {
        const pages = await this.getPageTree<TreeItem>(target_workspace_id);
        this.build_items_for_next_page(parent_page_id, new_page_id, pages);
        await this.setPageTree<TreeItem>(target_workspace_id, [...pages]);
    }
    private build_items_for_next_page(
        parent_page_id: string,
        new_page_id: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const child_page = children[i];
            if (child_page.id === parent_page_id) {
                const new_page = {
                    id: new_page_id,
                    title: 'Untitled',
                    children: [] as TreeItem[],
                };
                children = children.splice(i + 1, 0, new_page);
            } else if (child_page.children && child_page.children.length) {
                this.build_items_for_next_page(
                    parent_page_id,
                    new_page_id,
                    child_page.children
                );
            }
        }
    }
    private build_items_for_prev_page(
        parent_page_id: string,
        new_page_id: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const child_page = children[i];
            if (child_page.id === parent_page_id) {
                const new_page = {
                    id: new_page_id,
                    title: 'Untitled',
                    children: [] as TreeItem[],
                };
                children = children.splice(i - 1, 0, new_page);
            } else if (child_page.children && child_page.children.length) {
                this.build_items_for_prev_page(
                    parent_page_id,
                    new_page_id,
                    child_page.children
                );
            }
        }
    }
    private build_items_for_child_page(
        parent_page_id: string,
        new_page_id: string,
        children: TreeItem[]
    ) {
        for (let i = 0; i < children.length; i++) {
            const child_page = children[i];
            if (child_page.id === parent_page_id) {
                child_page.children = child_page.children || [];
                child_page.children.push({
                    id: new_page_id,
                    title: 'Untitled',
                    children: [],
                });
            } else if (child_page.children && child_page.children.length) {
                this.build_items_for_child_page(
                    parent_page_id,
                    new_page_id,
                    child_page.children
                );
            }
        }
    }
    // TODO: handles unobserve
    async observe(
        { workspace, page }: { workspace: string; page: string },
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        const unobserveWorkspace = await this._observe(
            workspace,
            workspace_db_block.id,
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
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        await this._unobserve(workspace, workspace_db_block.id);
    }
}

async function update_tree_items_title<
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
            item.children = await update_tree_items_title(
                db,
                item.children,
                cache
            );
        }
    }

    return [...items];
}
