import { setupGlobal } from '@affine/env/global';
import type { WorkspaceAdapter } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import {
  type RootWorkspaceMetadataV2,
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import {
  getOrCreateWorkspace,
  globalBlockSuiteSchema,
} from '@affine/workspace/manager';
import { assertExists } from '@blocksuite/global/utils';
import { nanoid } from '@blocksuite/store';
import {
  migrateLocalBlobStorage,
  migrateWorkspace,
  WorkspaceVersion,
} from '@toeverything/infra/blocksuite';
import { downloadBinary } from '@toeverything/y-indexeddb';
import type { createStore } from 'jotai/vanilla';
import { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

import { WorkspaceAdapters } from '../adapters/workspace';

async function tryMigration() {
  const value = localStorage.getItem('jotai-workspaces');
  if (value) {
    try {
      const metadata = JSON.parse(value) as RootWorkspaceMetadata[];
      const promises: Promise<void>[] = [];
      const newMetadata = [...metadata];
      metadata.forEach(oldMeta => {
        if (oldMeta.flavour === WorkspaceFlavour.LOCAL) {
          promises.push(
            migrateWorkspace(
              'version' in oldMeta ? oldMeta.version : undefined,
              {
                getCurrentRootDoc: async () => {
                  const doc = new Doc({
                    guid: oldMeta.id,
                  });
                  const downloadWorkspace = async (doc: Doc): Promise<void> => {
                    const binary = await downloadBinary(doc.guid);
                    if (binary) {
                      applyUpdate(doc, binary);
                    }
                    return Promise.all(
                      [...doc.subdocs.values()].map(subdoc =>
                        downloadWorkspace(subdoc)
                      )
                    ).then();
                  };
                  await downloadWorkspace(doc);
                  return doc;
                },
                createWorkspace: async () =>
                  getOrCreateWorkspace(nanoid(), WorkspaceFlavour.LOCAL),
                getSchema: () => globalBlockSuiteSchema,
              }
            ).then(async workspace => {
              if (typeof workspace !== 'boolean') {
                const adapter = WorkspaceAdapters[oldMeta.flavour];
                const oldWorkspace = await adapter.CRUD.get(oldMeta.id);
                const newId = await adapter.CRUD.create(workspace);
                assertExists(
                  oldWorkspace,
                  'workspace should exist after migrate'
                );
                await adapter.CRUD.delete(oldWorkspace.blockSuiteWorkspace);
                const index = newMetadata.findIndex(
                  meta => meta.id === oldMeta.id
                );
                newMetadata[index] = {
                  ...oldMeta,
                  id: newId,
                  version: WorkspaceVersion.DatabaseV3,
                };
                await migrateLocalBlobStorage(workspace.id, newId);
                console.log('workspace migrated', oldMeta.id, newId);
              } else if (workspace) {
                console.log('workspace migrated', oldMeta.id);
              }
            })
          );
        }
      });

      await Promise.all(promises)
        .then(() => {
          console.log('migration done');
        })
        .catch(e => {
          console.error('migration failed', e);
        })
        .finally(() => {
          localStorage.setItem('jotai-workspaces', JSON.stringify(newMetadata));
          window.dispatchEvent(new CustomEvent('migration-done'));
          window.$migrationDone = true;
        });
    } catch (e) {
      console.error('error when migrating data', e);
    }
  }
}

function createFirstAppData(store: ReturnType<typeof createStore>) {
  const createFirst = (): RootWorkspaceMetadataV2[] => {
    const Plugins = Object.values(WorkspaceAdapters).sort(
      (a, b) => a.loadPriority - b.loadPriority
    );

    return Plugins.flatMap(Plugin => {
      return Plugin.Events['app:init']?.().map(
        id =>
          <RootWorkspaceMetadataV2>{
            id,
            flavour: Plugin.flavour,
            version: WorkspaceVersion.DatabaseV3,
          }
      );
    }).filter((ids): ids is RootWorkspaceMetadataV2 => !!ids);
  };
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  const result = createFirst();
  console.info('create first workspace', result);
  localStorage.setItem('is-first-open', 'false');
  store.set(rootWorkspacesMetadataAtom, result);
}

export async function setup(store: ReturnType<typeof createStore>) {
  store.set(
    workspaceAdaptersAtom,
    WorkspaceAdapters as Record<
      WorkspaceFlavour,
      WorkspaceAdapter<WorkspaceFlavour>
    >
  );

  console.log('setup global');
  setupGlobal();

  createFirstAppData(store);
  await tryMigration();
  await store.get(rootWorkspacesMetadataAtom);
  console.log('setup done');
}
