import { getAuth, type User } from 'firebase/auth';

import {
    BlockClient,
    BlockClientInstance,
    BlockContentExporter,
    BlockInitOptions,
    BlockMatcher,
    Connectivity,
} from '@toeverything/datasource/jwt';
import { sleep } from '@toeverything/utils';

import type { ObserveCallback, ReturnUnobserve } from './observer';
import { getObserverName, ObserverManager } from './observer';
export type { ObserveCallback, ReturnUnobserve } from './observer';

const workspaces: Record<string, BlockClientInstance> = {};

const loading = new Set();

const waitLoading = async (key: string) => {
    while (loading.has(key)) {
        await sleep(50);
    }
};

async function _getCurrentToken() {
    if (!process.env['NX_LOCAL']) {
        const token = await getAuth().currentUser?.getIdToken();
        if (token) return token;
        return new Promise<string>(resolve => {
            getAuth().onIdTokenChanged((user: User | null) => {
                if (user) resolve(user.getIdToken());
            });
        });
    }
    return undefined;
}

const _enabled = {
    demo: [],
    AFFiNE: ['sqlite'],
} as any;

async function _getBlockDatabase(
    workspace: string,
    options?: BlockInitOptions
) {
    if (loading.has(workspace)) {
        await waitLoading(workspace);
    }

    if (!workspaces[workspace]) {
        loading.add(workspace);
        workspaces[workspace] = await BlockClient.init(workspace, {
            enabled: _enabled[workspace] || ['idb'],
            ...options,
            token: await _getCurrentToken(),
        });
        (window as any).client = workspaces[workspace];
        await workspaces[workspace].buildIndex();
        loading.delete(workspace);
    }
    return workspaces[workspace];
}

interface DatabaseProps {
    options?: BlockInitOptions;
}

export class Database {
    readonly #observers = new ObserverManager();

    readonly #options?: BlockInitOptions;
    constructor(props: DatabaseProps) {
        this.#options = props.options;
    }

    async getDatabase(workspace: string, options?: BlockInitOptions) {
        const db = await _getBlockDatabase(workspace, {
            ...this.#options,
            ...options,
        });
        return db;
    }

    async listenConnectivity(
        workspace: string,
        name: string,
        listener: (connectivity: Connectivity) => void
    ) {
        const db = await _getBlockDatabase(workspace, this.#options);
        return db.addConnectivityListener(name, state => {
            const connectivity = state.get(name);
            if (connectivity) listener(connectivity);
        });
    }

    async registerContentExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter
    ) {
        const db = await this.getDatabase(workspace);
        db.registerContentExporter(name, matcher, exporter);
    }

    async unregisterContentExporter(workspace: string, name: string) {
        const db = await this.getDatabase(workspace);
        db.unregisterContentExporter(name);
    }

    async registerMetadataExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter<
            Array<[string, number | string | string[]]>
        >
    ) {
        const db = await this.getDatabase(workspace);
        db.registerMetadataExporter(name, matcher, exporter);
    }

    async unregisterMetadataExporter(workspace: string, name: string) {
        const db = await this.getDatabase(workspace);
        db.unregisterMetadataExporter(name);
    }

    async registerTagExporter(
        workspace: string,
        name: string,
        matcher: BlockMatcher,
        exporter: BlockContentExporter<string[]>
    ) {
        const db = await this.getDatabase(workspace);
        db.registerTagExporter(name, matcher, exporter);
    }

    async unregisterTagExporter(workspace: string, name: string) {
        const db = await this.getDatabase(workspace);
        db.unregisterTagExporter(name);
    }

    async observe(
        workspace: string,
        blockId: string,
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        const observer_name = getObserverName(workspace, blockId);
        const unobserve = this.#observers.addCallback(observer_name, callback);
        if (this.#observers.getStatus(observer_name) === 'observing') {
            return unobserve;
        }
        const db = await this.getDatabase(workspace, this.#options);
        const block = await db.get(blockId as 'block');
        if (block) {
            const listener: Parameters<
                typeof block['on']
            >[2] = async states => {
                const new_block = await db.get(blockId as 'block');
                this.#observers.getCallbacks(observer_name).forEach(cb => {
                    cb(states, new_block);
                });
            };

            block.on('children', observer_name, listener);
            block.on('content', observer_name, listener);
            block.on('parent', observer_name, listener);
            // block.on('cascade', observer_name, listener);
        }
        this.#observers.setStatus(observer_name, 'observing');

        return unobserve;
    }

    async unobserve(
        workspace: string,
        blockId: string,
        callback?: ObserveCallback
    ) {
        const observer_name = getObserverName(workspace, blockId);
        this.#observers.removeCallback(observer_name, callback);
        if (!this.#observers.getCallbacks(observer_name).length) {
            const db = await this.getDatabase(workspace, this.#options);
            const block = await db.get(blockId as 'block');
            if (block) {
                block.off('children', observer_name);
                block.off('content', observer_name);
                block.off('parent', observer_name);
                // block.off('cascade', observer_name);
            }
        }
    }

    async setupDataExporter(
        workspace: string,
        initialData: Uint8Array,
        callback: (binary: Uint8Array) => Promise<void>
    ) {
        const db = await this.getDatabase(workspace);
        await db.setupDataExporter(initialData, callback);
    }
}
