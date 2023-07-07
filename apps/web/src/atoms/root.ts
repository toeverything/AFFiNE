//#region async atoms that to load the real workspace data
import { DebugLogger } from '@affine/debug';
import type {
  WorkspaceAdapter,
  WorkspaceRegistry,
} from '@affine/env/workspace';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import type { ActiveDocProvider } from '@blocksuite/store';
import type { PassiveDocProvider } from '@blocksuite/store';
import { atomWithObservable } from 'jotai/utils';
import { Observable } from 'rxjs';

import type { AllWorkspace } from '../shared';

const logger = new DebugLogger('web:atoms:root');

/**
 * Fetch all workspaces from the Plugin CRUD
 */
export const workspacesAtom = atomWithObservable(get => {
  const WorkspaceAdapters = get(workspaceAdaptersAtom);
  const metadataPromise = get(rootWorkspacesMetadataAtom);
  return new Observable<AllWorkspace[]>(subscriber => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function fetchWorkspaces(): Promise<void> {
      const flavours: string[] = Object.values(WorkspaceAdapters).map(
        plugin => plugin.flavour
      );
      const metadata = (await metadataPromise).filter(workspace =>
        flavours.includes(workspace.flavour)
      );

      // get this atom here that will not be detected by the dependency graph
      const currentWorkspaceId = get(rootCurrentWorkspaceIdAtom);

      const workspaces = await Promise.all(
        metadata.map(workspace => {
          const adapter = WorkspaceAdapters[
            workspace.flavour
          ] as WorkspaceAdapter<WorkspaceFlavour>;
          assertExists(adapter);
          const { CRUD } = adapter;
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
          (
            workspace
          ): workspace is WorkspaceRegistry['affine-cloud' | 'local'] =>
            workspace !== null
        )
      );
      const activeProviders = workspaces
        .filter(workspace => workspace.id !== currentWorkspaceId)
        .flatMap(workspace =>
          workspace.blockSuiteWorkspace.providers.filter(
            (provider): provider is ActiveDocProvider =>
              'active' in provider && provider.active
          )
        );
      const promises: Promise<void>[] = [];
      for (const provider of activeProviders) {
        provider.sync();
        promises.push(provider.whenReady);
      }
      // we will wait for all the necessary providers to be ready
      await Promise.all(promises);
      if (signal.aborted) {
        return;
      }
      const passiveProviders = workspaces
        // ignore current workspace
        .filter(workspace => workspace.id !== currentWorkspaceId)
        .flatMap(workspace =>
          workspace.blockSuiteWorkspace.providers.filter(
            (provider): provider is PassiveDocProvider =>
              'passive' in provider && provider.passive
          )
        );
      passiveProviders.forEach(provider => {
        provider.connect();
      });
      signal.addEventListener(
        'abort',
        () => {
          passiveProviders.forEach(provider => {
            provider.disconnect();
          });
        },
        {
          once: true,
        }
      );
      logger.info('workspaces', workspaces);
      subscriber.next(workspaces);
    }

    fetchWorkspaces().catch(subscriber.error);

    return () => {
      controller.abort();
    };
  });
});

/**
 * This will throw an error if the workspace is not found,
 * should not be used on the root component,
 * use `rootCurrentWorkspaceIdAtom` instead
 */
export const rootCurrentWorkspaceAtom = atomWithObservable(get => {
  const WorkspaceAdapters = get(workspaceAdaptersAtom);
  const targetId = get(rootCurrentWorkspaceIdAtom);
  const metadataPromise = get(rootWorkspacesMetadataAtom);
  return new Observable<AllWorkspace>(subscriber => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function fetchWorkspace() {
      if (targetId === null) {
        throw new Error(
          'current workspace id is null. this should not happen. If you see this error, please report it to the developer.'
        );
      }
      const metadata = await metadataPromise;
      const targetWorkspace = metadata.find(meta => meta.id === targetId);
      if (!targetWorkspace) {
        throw new Error(`cannot find the workspace with id ${targetId}.`);
      }

      const adapter = WorkspaceAdapters[
        targetWorkspace.flavour
      ] as WorkspaceAdapter<WorkspaceFlavour>;
      assertExists(adapter);

      const workspace = await adapter.CRUD.get(targetWorkspace.id);
      if (!workspace) {
        throw new Error(
          `cannot find the workspace with id ${targetId} in the plugin ${targetWorkspace.flavour}.`
        );
      }

      const activeProviders = workspace.blockSuiteWorkspace.providers.filter(
        (provider): provider is ActiveDocProvider =>
          'active' in provider && provider.active === true
      );
      for (const provider of activeProviders) {
        provider.sync();
        // we will wait for the necessary providers to be ready
        await provider.whenReady;
      }
      if (signal.aborted) {
        return;
      }
      const passiveProviders = workspace.blockSuiteWorkspace.providers.filter(
        (provider): provider is PassiveDocProvider =>
          'passive' in provider && provider.passive
      );
      passiveProviders.forEach(provider => {
        provider.connect();
      });
      signal.addEventListener(
        'abort',
        () => {
          passiveProviders.forEach(provider => {
            provider.disconnect();
          });
        },
        {
          once: true,
        }
      );
      logger.info('current workspace', workspace);
      subscriber.next(workspace);
      globalThis.currentWorkspace = workspace;
      globalThis.dispatchEvent(
        new CustomEvent('affine:workspace:change', {
          detail: { id: workspace.id },
        })
      );
    }
    fetchWorkspace().catch(err => {
      subscriber.error(err);
    });
    return () => {
      controller.abort();
    };
  });
});

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
