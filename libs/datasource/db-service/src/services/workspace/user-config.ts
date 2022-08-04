import { RECENT_PAGES, WORKSPACE_CONFIG } from '../../utils';
import { ServiceBaseClass } from '../base';
import { ObserveCallback, ReturnUnobserve } from '../database';
import { PageTree } from './page-tree';
import { PageConfigItem } from './types';
import { QueryIndexMetadata } from '@toeverything/datasource/jwt';

/** Operate the user configuration at the workspace level */
export class UserConfig extends ServiceBaseClass {
    private async _fetchRecentPages(
        workspace: string
    ): Promise<Record<string, Array<PageConfigItem>>> {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        const recentWorkPages =
            workspaceDbBlock.getDecoration<
                Record<string, Array<PageConfigItem>>
            >(RECENT_PAGES) || {};
        return recentWorkPages;
    }

    private async _saveRecentPages(
        workspace: string,
        recentPages: Record<string, Array<PageConfigItem>>
    ) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        workspaceDbBlock.setDecoration(RECENT_PAGES, recentPages);
    }

    async getUserInitialPage(
        workspace: string,
        userId: string
    ): Promise<string> {
        const recentPages = await this.getRecentPages(workspace, userId);
        if (recentPages.length > 0) {
            return recentPages[0].id;
        }

        const db = await this.database.getDatabase(workspace);
        const newPage = await db.get('page');

        await this.get_dependency(PageTree).addPage(workspace, newPage.id);
        await this.addRecentPage(workspace, userId, newPage.id);
        return newPage.id;
    }

    async getRecentPages(
        workspace: string,
        userId: string,
        topNumber = 5
    ): Promise<PageConfigItem[]> {
        const recentWorkPages = await this._fetchRecentPages(workspace);
        const recentPages = (recentWorkPages[userId] || []).slice(0, topNumber);
        const db = await this.database.getDatabase(workspace);
        for (const item of recentPages) {
            const page = await db.get(item.id as 'page');
            item.title =
                page
                    .getDecoration<{ value: Array<{ text: string }> }>('text')
                    ?.value?.map(v => v.text)
                    .join('') || 'Untitled';
        }
        return recentPages;
    }

    async addRecentPage(workspace: string, userId: string, pageId: string) {
        const recentWorkPages = await this._fetchRecentPages(workspace);
        let recentPages = recentWorkPages[userId] || [];
        recentPages = recentPages.filter(item => item.id !== pageId);
        recentPages.unshift({
            id: pageId,
            lastOpenTime: Date.now(),
        });
        recentWorkPages[userId] = recentPages;
        await this._saveRecentPages(workspace, recentWorkPages);
    }

    async removePage(workspace: string, pageId: string) {
        const recentWorkPages = await this._fetchRecentPages(workspace);
        for (const key in recentWorkPages) {
            recentWorkPages[key] = recentWorkPages[key].filter(
                item => item.id !== pageId
            );
        }
        await this._saveRecentPages(workspace, recentWorkPages);
    }

    async observe(
        { workspace }: { workspace: string },
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        const unobserveWorkspace = await this._observe(
            workspace,
            workspaceDbBlock.id,
            (states, block) => {
                callback(states, block);
            }
        );

        return () => {
            unobserveWorkspace();
        };
    }

    async unobserve({ workspace }: { workspace: string }) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        await this._unobserve(workspace, workspaceDbBlock.id);
    }

    async getWorkspaceName(workspace: string): Promise<string> {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        const workspaceName =
            workspaceDbBlock.getDecoration<string>(WORKSPACE_CONFIG) || '';
        return workspaceName;
    }

    async getWorkspaceId(workspace: string): Promise<string> {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        return workspaceDbBlock.id;
    }

    async setWorkspaceName(workspace: string, workspaceName: string) {
        const workspaceDbBlock = await this.getWorkspaceDbBlock(workspace);
        workspaceDbBlock.setDecoration(WORKSPACE_CONFIG, workspaceName);
    }

    async getRecentEditedPages(workspace: string) {
        const db = await this.database.getDatabase(workspace);
        const recentEditedPages =
            (await db.queryBlocks({
                $sort: 'lastUpdated',
                $desc: false /* sort rule: true(default)(ASC), or false(DESC) */,
                $limit: 4,
                flavor: 'page',
            } as QueryIndexMetadata)) || [];

        return recentEditedPages.map(item => {
            item['title'] = item.content || 'Untitled';
            return item;
        });
    }
}
