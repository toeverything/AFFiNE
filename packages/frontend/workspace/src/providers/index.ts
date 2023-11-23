/**
 * The `Provider` is responsible for sync `Y.Doc` with the local database and the Affine Cloud, serving as the source of
 * Affine's local-first collaborative magic.
 *
 * When Affine boot, the `Provider` is tasked with reading content from the local database and loading it into the
 * workspace, continuously storing any changes made by the user into the local database.
 *
 * When using Affine Cloud, the `Provider` also handles sync content with the Cloud.
 *
 * Additionally, the `Provider` is responsible for implementing a local-first capability, allowing users to edit offline
 * with changes stored in the local database and sync with the Cloud when the network is restored.
 */

import type { DocProviderCreator } from '@blocksuite/store';

import {
  createAffineAwarenessProvider,
  createBroadcastChannelAwarenessProvider,
} from './awareness';
import { createAffineStorage } from './storage/affine';
import { createIndexedDBStorage } from './storage/indexeddb';
import { createSQLiteStorage } from './storage/sqlite';
import { SyncEngine } from './sync';

export * from './sync';

export const createLocalProviders = (): DocProviderCreator[] => {
  return [
    (_, doc, { awareness }) => {
      const engine = new SyncEngine(
        doc,
        environment.isDesktop
          ? createSQLiteStorage(doc.guid)
          : createIndexedDBStorage(doc.guid),
        []
      );

      const awarenessProviders = [
        createBroadcastChannelAwarenessProvider(doc.guid, awareness),
      ];

      let connected = false;

      return {
        flavour: '_',
        passive: true,
        active: true,
        sync() {
          if (!connected) {
            engine.start();

            for (const provider of awarenessProviders) {
              provider.connect();
            }
            connected = true;
          }
        },
        get whenReady() {
          return engine.waitForLoadedRootDoc();
        },
        connect() {
          if (!connected) {
            engine.start();

            for (const provider of awarenessProviders) {
              provider.connect();
            }
            connected = true;
          }
        },
        disconnect() {
          // TODO: actually disconnect
        },
        get connected() {
          return connected;
        },
        engine,
      };
    },
  ];
};

export const createAffineProviders = (): DocProviderCreator[] => {
  return [
    (_, doc, { awareness }) => {
      const engine = new SyncEngine(
        doc,
        environment.isDesktop
          ? createSQLiteStorage(doc.guid)
          : createIndexedDBStorage(doc.guid),
        [createAffineStorage(doc.guid)]
      );

      const awarenessProviders = [
        createBroadcastChannelAwarenessProvider(doc.guid, awareness),
        createAffineAwarenessProvider(doc.guid, awareness),
      ];

      let connected = false;

      return {
        flavour: '_',
        passive: true,
        active: true,
        sync() {
          if (!connected) {
            engine.start();

            for (const provider of awarenessProviders) {
              provider.connect();
            }
            connected = true;
          }
        },
        get whenReady() {
          return engine.waitForLoadedRootDoc();
        },
        connect() {
          if (!connected) {
            engine.start();

            for (const provider of awarenessProviders) {
              provider.connect();
            }
            connected = true;
          }
        },
        disconnect() {
          // TODO: actually disconnect
        },
        get connected() {
          return connected;
        },
        engine,
      };
    },
  ];
};

export const createAffinePublicProviders = (): DocProviderCreator[] => {
  return [];
};
