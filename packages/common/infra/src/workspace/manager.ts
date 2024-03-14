import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertEquals } from '@blocksuite/global/utils';
import type { DocCollection } from '@blocksuite/store';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { setupEditorFlags } from '../atom/settings';
import { fixWorkspaceVersion } from '../blocksuite';
import type { ServiceCollection, ServiceProvider } from '../di';
import { ObjectPool } from '../utils/object-pool';
import { configureWorkspaceContext } from './context';
import type { BlobStorage } from './engine';
import type { WorkspaceFactory } from './factory';
import type { WorkspaceListService } from './list';
import type { WorkspaceMetadata } from './metadata';
import { WorkspaceScope } from './service-scope';
import { Workspace } from './workspace';

const logger = new DebugLogger('affine:workspace-manager');

/**
 * # `WorkspaceManager`
 *
 * This class acts as the central hub for managing various aspects of workspaces.
 * It is structured as follows:
 *
 * ```
 *                ┌───────────┐
 *                │ Workspace │
 *                │  Manager  │
 *                └─────┬─────┘
 *        ┌─────────────┼─────────────┐
 *    ┌───┴───┐     ┌───┴───┐   ┌─────┴─────┐
 *    │ List  │     │ Pool  │   │ Factories │
 *    └───────┘     └───────┘   └───────────┘
 * ```
 *
 * Manage every about workspace
 *
 * # List
 *
 * The `WorkspaceList` component stores metadata for all workspaces, also include workspace avatar and custom name.
 *
 * # Factories
 *
 * This class contains a collection of `WorkspaceFactory`,
 * We utilize `metadata.flavour` to identify the appropriate factory for opening a workspace.
 * Once opened, workspaces are stored in the `WorkspacePool`.
 *
 * # Pool
 *
 * The `WorkspacePool` use reference counting to manage active workspaces.
 * Calling `use()` to create a reference to the workspace. Calling `release()` to release the reference.
 * When the reference count is 0, it will close the workspace.
 *
 */
export class WorkspaceManager {
  pool = new ObjectPool<string, Workspace>({
    onDelete(workspace) {
      workspace.forceStop();
    },
    onDangling(workspace) {
      return workspace.canGracefulStop();
    },
  });

  constructor(
    public readonly list: WorkspaceListService,
    public readonly factories: WorkspaceFactory[],
    private readonly serviceProvider: ServiceProvider
  ) {}

  /**
   * get workspace reference by metadata.
   *
   * You basically don't need to call this function directly, use the react hook `useWorkspace(metadata)` instead.
   *
   * @returns the workspace reference and a release function, don't forget to call release function when you don't
   * need the workspace anymore.
   */
  open(metadata: WorkspaceMetadata): {
    workspace: Workspace;
    release: () => void;
  } {
    const exist = this.pool.get(metadata.id);
    if (exist) {
      return {
        workspace: exist.obj,
        release: exist.release,
      };
    }

    const workspace = this.instantiate(metadata);
    // sync information with workspace list, when workspace's avatar and name changed, information will be updated
    this.list.getInformation(metadata).syncWithWorkspace(workspace);

    const ref = this.pool.put(workspace.meta.id, workspace);

    return {
      workspace: ref.obj,
      release: ref.release,
    };
  }

  createWorkspace(
    flavour: WorkspaceFlavour,
    initial?: (
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    logger.info(`create workspace [${flavour}]`);
    return this.list.create(flavour, initial);
  }

  /**
   * delete workspace by metadata, same as `WorkspaceList.deleteWorkspace`
   */
  async deleteWorkspace(metadata: WorkspaceMetadata) {
    await this.list.delete(metadata);
  }

  /**
   * helper function to transform local workspace to cloud workspace
   */
  async transformLocalToCloud(local: Workspace): Promise<WorkspaceMetadata> {
    assertEquals(local.flavour, WorkspaceFlavour.LOCAL);

    await local.engine.sync.waitForSynced();

    const newId = await this.list.create(
      WorkspaceFlavour.AFFINE_CLOUD,
      async (ws, bs) => {
        applyUpdate(ws.doc, encodeStateAsUpdate(local.docCollection.doc));

        for (const subdoc of local.docCollection.doc.getSubdocs()) {
          for (const newSubdoc of ws.doc.getSubdocs()) {
            if (newSubdoc.guid === subdoc.guid) {
              applyUpdate(newSubdoc, encodeStateAsUpdate(subdoc));
            }
          }
        }

        const blobList = await local.engine.blob.list();

        for (const blobKey of blobList) {
          const blob = await local.engine.blob.get(blobKey);
          if (blob) {
            await bs.set(blobKey, blob);
          }
        }
      }
    );

    await this.list.delete(local.meta);

    return newId;
  }

  /**
   * helper function to get blob without open workspace, its be used for download workspace avatars.
   */
  getWorkspaceBlob(metadata: WorkspaceMetadata, blobKey: string) {
    const factory = this.factories.find(x => x.name === metadata.flavour);
    if (!factory) {
      throw new Error(`Unknown workspace flavour: ${metadata.flavour}`);
    }
    return factory.getWorkspaceBlob(metadata.id, blobKey);
  }

  instantiate(
    metadata: WorkspaceMetadata,
    configureWorkspace?: (serviceCollection: ServiceCollection) => void
  ) {
    logger.info(`open workspace [${metadata.flavour}] ${metadata.id} `);
    const serviceCollection = this.serviceProvider.collection.clone();
    if (configureWorkspace) {
      configureWorkspace(serviceCollection);
    } else {
      const factory = this.factories.find(x => x.name === metadata.flavour);
      if (!factory) {
        throw new Error(`Unknown workspace flavour: ${metadata.flavour}`);
      }
      factory.configureWorkspace(serviceCollection);
    }
    configureWorkspaceContext(serviceCollection, metadata);
    const provider = serviceCollection.provider(
      WorkspaceScope,
      this.serviceProvider
    );
    const workspace = provider.get(Workspace);

    // apply compatibility fix
    fixWorkspaceVersion(workspace.docCollection.doc);

    setupEditorFlags(workspace.docCollection);

    return workspace;
  }
}
