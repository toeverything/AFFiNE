import {
  migrateDatabaseBlockTo3,
  migrateToSubdoc,
} from '@affine/env/blocksuite';
import { setupGlobal } from '@affine/env/global';
import type {
  LocalIndexedDBDownloadProvider,
  WorkspaceAdapter,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import {
  type RootWorkspaceMetadataV2,
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import {
  migrateLocalBlobStorage,
  upgradeV1ToV2,
} from '@affine/workspace/migration';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import { rootStore } from '@toeverything/infra/atom';

import { WorkspaceAdapters } from '../adapters/workspace';

async function tryMigration() {
  const value = localStorage.getItem('jotai-workspaces');
  if (value) {
    try {
      const metadata = JSON.parse(value) as RootWorkspaceMetadata[];
      const promises: Promise<void>[] = [];
      const newMetadata = [...metadata];
      metadata.forEach(oldMeta => {
        if (!('version' in oldMeta)) {
          const adapter = WorkspaceAdapters[oldMeta.flavour];
          assertExists(adapter);
          const upgrade = async () => {
            if (oldMeta.flavour !== WorkspaceFlavour.LOCAL) {
              console.warn('not supported');
              return;
            }
            const workspace = await adapter.CRUD.get(oldMeta.id);
            if (!workspace) {
              console.warn('cannot find workspace', oldMeta.id);
              return;
            }
            const doc = workspace.blockSuiteWorkspace.doc;
            const provider = createIndexedDBDownloadProvider(
              workspace.id,
              doc,
              {
                awareness:
                  workspace.blockSuiteWorkspace.awarenessStore.awareness,
              }
            ) as LocalIndexedDBDownloadProvider;
            provider.sync();
            await provider.whenReady;
            const newDoc = migrateToSubdoc(doc);
            if (doc === newDoc) {
              console.log('doc not changed');
              return;
            }
            const newWorkspace = upgradeV1ToV2(workspace);
            await migrateDatabaseBlockTo3(newWorkspace.blockSuiteWorkspace.doc);

            const newId = await adapter.CRUD.create(
              newWorkspace.blockSuiteWorkspace
            );

            await adapter.CRUD.delete(workspace as any);
            console.log('migrated', oldMeta.id, newId);
            const index = newMetadata.findIndex(meta => meta.id === oldMeta.id);
            newMetadata[index] = {
              ...oldMeta,
              id: newId,
              version: WorkspaceVersion.DatabaseV3,
            };
            await migrateLocalBlobStorage(workspace.id, newId);
            console.log('migrate to v2');
          };

          // create a new workspace and push it to metadata
          promises.push(upgrade());
        } else if (oldMeta.version < WorkspaceVersion.DatabaseV3) {
          const adapter = WorkspaceAdapters[oldMeta.flavour];
          assertExists(adapter);
          promises.push(
            (async () => {
              if (oldMeta.flavour !== WorkspaceFlavour.LOCAL) {
                console.warn('not supported');
                return;
              }
              const workspace = await adapter.CRUD.get(oldMeta.id);
              if (workspace) {
                const provider = createIndexedDBDownloadProvider(
                  workspace.id,
                  workspace.blockSuiteWorkspace.doc,
                  {
                    awareness:
                      workspace.blockSuiteWorkspace.awarenessStore.awareness,
                  }
                ) as LocalIndexedDBDownloadProvider;
                provider.sync();
                await provider.whenReady;
                await migrateDatabaseBlockTo3(
                  workspace.blockSuiteWorkspace.doc
                );
              }
              const index = newMetadata.findIndex(
                meta => meta.id === oldMeta.id
              );
              newMetadata[index] = {
                ...oldMeta,
                version: WorkspaceVersion.DatabaseV3,
              };
              console.log('migrate to v3');
            })()
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

function createFirstAppData() {
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
  rootStore.set(rootWorkspacesMetadataAtom, result);
}

export async function setup() {
  rootStore.set(
    workspaceAdaptersAtom,
    WorkspaceAdapters as Record<
      WorkspaceFlavour,
      WorkspaceAdapter<WorkspaceFlavour>
    >
  );

  console.log('setup global');
  setupGlobal();

  createFirstAppData();
  await tryMigration();
  await rootStore.get(rootWorkspacesMetadataAtom);
  console.log('setup done');
}
