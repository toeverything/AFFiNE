import { setupGlobal } from '@affine/env/global';
import type { WorkspaceAdapter } from '@affine/env/workspace';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import {
  type RootWorkspaceMetadataV2,
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import type { createStore } from 'jotai/vanilla';

import { WorkspaceAdapters } from '../adapters/workspace';
import { performanceLogger } from '../shared';

const performanceSetupLogger = performanceLogger.namespace('setup');

export function createFirstAppData(store: ReturnType<typeof createStore>) {
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
  performanceSetupLogger.info('start');
  store.set(
    workspaceAdaptersAtom,
    WorkspaceAdapters as Record<
      WorkspaceFlavour,
      WorkspaceAdapter<WorkspaceFlavour>
    >
  );

  performanceSetupLogger.info('setup global');
  setupGlobal();

  performanceSetupLogger.info('get root workspace meta');
  // do not read `rootWorkspacesMetadataAtom` before migration
  await store.get(rootWorkspacesMetadataAtom);

  performanceSetupLogger.info('done');
}
