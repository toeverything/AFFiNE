import { Doc } from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';

import {
    SQLiteProvider,
    WebsocketProvider,
} from '@toeverything/datasource/jwt-rpc';

import { Connectivity } from '../../adapter';
import { BucketBackend } from '../../types';

type YjsDefaultInstances = {
    awareness: Awareness;
    doc: Doc;
    token?: string;
    workspace: string;
    emitState: (connectivity: Connectivity) => void;
};

export type YjsProvider = (instances: YjsDefaultInstances) => Promise<void>;

export type YjsProviderOptions = {
    backend: typeof BucketBackend[keyof typeof BucketBackend];
    params?: Record<string, string>;
    importData?: Uint8Array;
    exportData?: (binary: Uint8Array) => void;
};

export const getYjsProviders = (
    options: YjsProviderOptions
): Record<string, YjsProvider> => {
    return {
        sqlite: async (instances: YjsDefaultInstances) => {
            const fs = new SQLiteProvider(
                instances.workspace,
                instances.doc,
                options.importData
            );
            if (options.exportData) fs.registerExporter(options.exportData);
            await fs.whenSynced;
        },
        ws: async (instances: YjsDefaultInstances) => {
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
        },
    };
};
