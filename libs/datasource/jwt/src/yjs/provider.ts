import { Awareness } from 'y-protocols/awareness.js';
import { Doc } from 'yjs';

import {
    IndexedDBProvider,
    SQLiteProvider,
    WebsocketProvider,
} from '@toeverything/datasource/jwt-rpc';

import { BucketBackend } from '../types';
import { Connectivity } from './types';

type YjsDefaultInstances = {
    awareness: Awareness;
    doc: Doc;
    token?: string | undefined;
    workspace: string;
    emitState: (connectivity: Connectivity) => void;
};

export type YjsProvider = (instances: YjsDefaultInstances) => Promise<void>;

type ProviderType = 'idb' | 'sqlite' | 'ws';

export type YjsProviderOptions = {
    enabled: ProviderType[];
    backend: typeof BucketBackend[keyof typeof BucketBackend];
    params?: Record<string, string>;
    importData?: () => Promise<Uint8Array> | Uint8Array | undefined;
    exportData?: (binary: Uint8Array) => Promise<void> | undefined;
    hasExporter?: () => boolean;
};

export const getYjsProviders = (
    options: YjsProviderOptions
): Record<string, YjsProvider> => {
    console.log('getYjsProviders', options);
    return {
        indexeddb: async (instances: YjsDefaultInstances) => {
            if (options.enabled.includes('idb')) {
                await new IndexedDBProvider(instances.workspace, instances.doc)
                    .whenSynced;
            }
        },
        sqlite: async (instances: YjsDefaultInstances) => {
            if (options.enabled.includes('sqlite')) {
                const fsHandle = setInterval(async () => {
                    if (options.hasExporter?.()) {
                        clearInterval(fsHandle);
                        const fs = new SQLiteProvider(
                            instances.workspace,
                            instances.doc,
                            await options.importData?.()
                        );
                        if (options.exportData) {
                            fs.registerExporter(options.exportData);
                        }
                        await fs.whenSynced;
                    }
                }, 500);
            }
        },
        ws: async (instances: YjsDefaultInstances) => {
            if (options.enabled.includes('ws')) {
                if (instances.token) {
                    const ws = new WebsocketProvider(
                        instances.token,
                        options.backend,
                        instances.workspace,
                        instances.doc,
                        {
                            awareness: instances.awareness,
                            params: options.params,
                        }
                    ) as any; // TODO: type is erased after cascading references

                    // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
                    return new Promise<void>((resolve, reject) => {
                        // TODO: synced will also be triggered on reconnection after losing sync
                        // There needs to be an event mechanism to emit the synchronization state to the upper layer
                        ws.once('synced', () => resolve());
                        ws.once('lost-connection', () => resolve());
                        ws.once('connection-error', () => reject());
                        ws.on('synced', () => instances.emitState('connected'));
                        ws.on('lost-connection', () =>
                            instances.emitState('retry')
                        );
                        ws.on('connection-error', () =>
                            instances.emitState('retry')
                        );
                    });
                } else {
                    return;
                }
            }
        },
    };
};
