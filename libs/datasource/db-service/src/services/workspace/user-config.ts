import { RECENT_PAGES, WORKSPACE_CONFIG } from '../../utils';
import { ServiceBaseClass } from '../base';
import { ObserveCallback, ReturnUnobserve } from '../database';
import { PageTree } from './page-tree';
import { PageConfigItem } from './types';

/** Operate the user configuration at the workspace level */
export class UserConfig extends ServiceBaseClass {
    private async fetch_recent_pages(
        workspace: string
    ): Promise<Record<string, Array<PageConfigItem>>> {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        const recent_work_pages =
            workspace_db_block.getDecoration<
                Record<string, Array<PageConfigItem>>
            >(RECENT_PAGES) || {};
        return recent_work_pages;
    }

    private async save_recent_pages(
        workspace: string,
        recentPages: Record<string, Array<PageConfigItem>>
    ) {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        workspace_db_block.setDecoration(RECENT_PAGES, recentPages);
    }

    async getUserInitialPage(
        workspace: string,
        userId: string
    ): Promise<string> {
        const recent_pages = await this.getRecentPages(workspace, userId);
        if (recent_pages.length > 0) {
            return recent_pages[0].id;
        }

        const db = await this.database.getDatabase(workspace);
        const new_page = await db.get('page');

        await this.get_dependency(PageTree).addPage(workspace, new_page.id);
        await this.addRecentPage(workspace, userId, new_page.id);
        return new_page.id;
    }

    async getRecentPages(
        workspace: string,
        userId: string,
        topNumber = 5
    ): Promise<PageConfigItem[]> {
        const recent_work_pages = await this.fetch_recent_pages(workspace);
        const recent_pages = (recent_work_pages[userId] || []).slice(
            0,
            topNumber
        );
        const db = await this.database.getDatabase(workspace);
        for (const item of recent_pages) {
            const page = await db.get(item.id as 'page');
            item.title =
                page
                    .getDecoration<{ value: Array<{ text: string }> }>('text')
                    ?.value?.map(v => v.text)
                    .join('') || 'Untitled';
        }
        return recent_pages;
    }

    async addRecentPage(workspace: string, userId: string, pageId: string) {
        const recent_work_pages = await this.fetch_recent_pages(workspace);
        let recent_pages = recent_work_pages[userId] || [];
        recent_pages = recent_pages.filter(item => item.id !== pageId);
        recent_pages.unshift({
            id: pageId,
            lastOpenTime: Date.now(),
        });
        recent_work_pages[userId] = recent_pages;
        await this.save_recent_pages(workspace, recent_work_pages);
    }

    async removePage(workspace: string, pageId: string) {
        const recent_work_pages = await this.fetch_recent_pages(workspace);
        for (const key in recent_work_pages) {
            recent_work_pages[key] = recent_work_pages[key].filter(
                item => item.id !== pageId
            );
        }
        await this.save_recent_pages(workspace, recent_work_pages);
    }

    async observe(
        { workspace }: { workspace: string },
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        const unobserveWorkspace = await this._observe(
            workspace,
            workspace_db_block.id,
            (states, block) => {
                callback(states, block);
            }
        );

        return () => {
            unobserveWorkspace();
        };
    }

    async unobserve({ workspace }: { workspace: string }) {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        await this._unobserve(workspace, workspace_db_block.id);
    }

    async getWorkspaceName(workspace: string): Promise<string> {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        const workspaceName =
            workspace_db_block.getDecoration<string>(WORKSPACE_CONFIG) ||
            workspace_db_block.id;
        return workspaceName;
    }

    async setWorkspaceName(workspace: string, workspaceName: string) {
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        workspace_db_block.setDecoration(WORKSPACE_CONFIG, workspaceName);
    }
}
