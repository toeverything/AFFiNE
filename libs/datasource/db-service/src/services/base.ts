import {
    BlockClientInstance,
    BlockInitOptions,
    BlockImplInstance,
    BlockMatcher,
    BlockContentExporter,
    QueryIndexMetadata,
} from '@toeverything/datasource/jwt';
import { DependencyCallOrConstructProps } from '@toeverything/utils';
import { Database } from './database';
import type { ObserveCallback, ReturnUnobserve } from './database/observer';

export abstract class ServiceBaseClass {
    protected database: Database;
    protected get_dependency: DependencyCallOrConstructProps['getDependency'];
    constructor(props: DependencyCallOrConstructProps) {
        this.get_dependency = props.getDependency;
        this.database = this.get_dependency(Database);
    }

    async getWorkspaceDbBlock(workspace: string, options?: BlockInitOptions) {
        const db = await this.database.getDatabase(workspace, options);
        return db.getWorkspace();
    }

    async listenConnectivity(
        workspace: string,
        callback: (state: string) => void
    ) {
        this.database.listenConnectivity(workspace, workspace, callback);
    }

    async onHistoryChange(
        workspace: string,
        name: string,
        callback: (meta: Map<string, any>) => void
    ) {
        const db = await this.database.getDatabase(workspace);
        db.history.onPush(name, callback);
    }

    async onHistoryRevoke(
        workspace: string,
        name: string,
        callback: (meta: Map<string, any>) => void
    ) {
        const db = await this.database.getDatabase(workspace);
        db.history.onPop(name, callback);
    }

    async undo(workspace: string) {
        const db = await this.database.getDatabase(workspace);
        return db.history.undo();
    }

    async redo(workspace: string) {
        const db = await this.database.getDatabase(workspace);
        return db.history.redo();
    }

    async search(
        workspace: string,
        query: Parameters<BlockClientInstance['searchPages']>[0]
    ) {
        const db = await this.database.getDatabase(workspace);
        return db.searchPages(query);
    }

    async query(
        workspace: string,
        query: QueryIndexMetadata
    ): Promise<null | any[]> {
        const db = await this.database.getDatabase(workspace);
        return db.query(query);
    }

    async clearUndoRedo(workspace: string) {
        const db = await this.database.getDatabase(workspace);
        return db.history.clear();
    }

    /**
     * Get the block, unlike db.get, if the id does not exist, it will return undefined
     * @param workspace
     * @param blockId
     * @returns
     */
    async getBlock(
        workspace: string,
        blockId: string
    ): Promise<BlockImplInstance | undefined> {
        if (!blockId) return undefined;
        const db = await this.database.getDatabase(workspace);
        const db_block = await db.get(blockId as 'block');
        if (db_block.id !== blockId) {
            return undefined;
        }
        return db_block;
    }

    async registerContentExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter
    ) {
        await this.database.registerContentExporter(
            workspace,
            name,
            matcher,
            exporter
        );
    }

    async unregisterContentExporter(workspace: string, name: string) {
        await this.database.unregisterContentExporter(workspace, name);
    }

    async registerMetadataExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter<
            Array<[string, number | string | string[]]>
        >
    ) {
        await this.database.registerMetadataExporter(
            workspace,
            name,
            matcher,
            exporter
        );
    }

    async unregisterMetadataExporter(workspace: string, name: string) {
        await this.database.unregisterMetadataExporter(workspace, name);
    }

    async registerTagExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter<string[]>
    ) {
        await this.database.registerTagExporter(
            workspace,
            name,
            matcher,
            exporter
        );
    }

    async unregisterTagExporter(workspace: string, name: string) {
        await this.database.unregisterTagExporter(workspace, name);
    }

    protected async _observe(
        workspace: string,
        blockId: string,
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        return await this.database.observe(workspace, blockId, async states => {
            const db = await this.database.getDatabase(workspace);
            const new_block = await db.get(blockId as 'block');
            callback(states, new_block);
        });
    }

    protected async _unobserve(
        workspace: string,
        blockId: string,
        callback?: ObserveCallback
    ) {
        return await this.database.unobserve(workspace, blockId, callback);
    }
}
