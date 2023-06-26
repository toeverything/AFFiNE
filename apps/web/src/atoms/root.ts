//#region async atoms that to load the real workspace data
import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import type { WorkspaceRegistry } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import type { ActiveDocProvider } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { atom } from 'jotai';

import type { AllWorkspace } from '../shared';

const logger = new DebugLogger('web:atoms:root');

/**
 * Fetch all workspaces from the Plugin CRUD
 */
export const workspacesAtom = atom<Promise<AllWorkspace[]>>(
  async (get, { signal }) => {
    const { WorkspaceAdapters } = await import('../adapters/workspace');
    const flavours: string[] = Object.values(WorkspaceAdapters).map(
      plugin => plugin.flavour
    );
    const jotaiWorkspaces = get(rootWorkspacesMetadataAtom)
      .filter(
        workspace => flavours.includes(workspace.flavour)
        // TODO: remove this when we remove the legacy cloud
      )
      .filter(workspace =>
        !config.enableLegacyCloud
          ? workspace.flavour !== WorkspaceFlavour.AFFINE
          : true
      );
    if (jotaiWorkspaces.some(meta => meta.version === undefined)) {
      // wait until all workspaces have migrated to v2
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', reject);
        setTimeout(resolve, 1000);
      }).catch(() => {
        // do nothing
      });
    }
    const workspaces = await Promise.all(
      jotaiWorkspaces.map(workspace => {
        const plugin =
          WorkspaceAdapters[
            workspace.flavour as keyof typeof WorkspaceAdapters
          ];
        assertExists(plugin);
        const { CRUD } = plugin;
        return CRUD.get(workspace.id).then(workspace => {
          if (workspace === null) {
            console.warn(
              'workspace is null. this should not happen. If you see this error, please report it to the developer.'
            );
          }
          return workspace;
        });
      })
    ).then(workspaces =>
      workspaces.filter(
        (workspace): workspace is WorkspaceRegistry['affine' | 'local'] =>
          workspace !== null
      )
    );
    const workspaceProviders = workspaces.map(workspace =>
      workspace.blockSuiteWorkspace.providers.filter(
        (provider): provider is ActiveDocProvider =>
          'active' in provider && provider.active
      )
    );
    const promises: Promise<void>[] = [];
    for (const providers of workspaceProviders) {
      for (const provider of providers) {
        provider.sync();
        promises.push(provider.whenReady);
      }
    }
    // we will wait for all the necessary providers to be ready
    await Promise.all(promises);
    logger.info('workspaces', workspaces);
    return workspaces;
  }
);

/**
 * This will throw an error if the workspace is not found,
 * should not be used on the root component,
 * use `rootCurrentWorkspaceIdAtom` instead
 */
export const rootCurrentWorkspaceAtom = atom<Promise<AllWorkspace>>(
  async (get, { signal }) => {
    const { WorkspaceAdapters } = await import('../adapters/workspace');
    const metadata = get(rootWorkspacesMetadataAtom);
    const targetId = get(rootCurrentWorkspaceIdAtom);
    if (targetId === null) {
      throw new Error(
        'current workspace id is null. this should not happen. If you see this error, please report it to the developer.'
      );
    }
    const targetWorkspace = metadata.find(meta => meta.id === targetId);
    if (!targetWorkspace) {
      throw new Error(`cannot find the workspace with id ${targetId}.`);
    }

    if (!targetWorkspace.version) {
      // wait until the workspace has migrated to v2
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', reject);
        setTimeout(resolve, 1000);
      }).catch(() => {
        // do nothing
      });
    }

    const workspace = await WorkspaceAdapters[targetWorkspace.flavour].CRUD.get(
      targetWorkspace.id
    );
    if (!workspace) {
      throw new Error(
        `cannot find the workspace with id ${targetId} in the plugin ${targetWorkspace.flavour}.`
      );
    }

    const providers = workspace.blockSuiteWorkspace.providers.filter(
      (provider): provider is ActiveDocProvider =>
        'active' in provider && provider.active === true
    );
    for (const provider of providers) {
      provider.sync();
      // we will wait for the necessary providers to be ready
      await provider.whenReady;
    }
    logger.info('current workspace', workspace);
    globalThis.currentWorkspace = workspace;
    globalThis.dispatchEvent(
      new CustomEvent('affine:workspace:change', {
        detail: { id: workspace.id },
      })
    );
    return workspace;
  }
);

declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: AllWorkspace | undefined;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

// Do not add `rootCurrentWorkspacePageAtom`, this is not needed.
// It can be derived from `rootCurrentWorkspaceAtom` and `rootCurrentPageIdAtom`

//#endregion
