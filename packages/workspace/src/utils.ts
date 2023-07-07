import { isBrowser, isDesktop } from '@affine/env/constant';
import type { BlockSuiteFeatureFlags } from '@affine/env/global';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createAffineProviders,
  createLocalProviders,
} from '@affine/workspace/providers';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type {
  ActiveDocProvider,
  DocProviderCreator,
  Generator,
  StoreOptions,
} from '@blocksuite/store';
import { createIndexeddbStorage, Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai/react';
import type { Atom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';

import { createStaticStorage } from './blob/local-static-storage';
import { createSQLiteStorage } from './blob/sqlite-blob-storage';

function setEditorFlags(workspace: Workspace) {
  Object.entries(runtimeConfig.editorFlags).forEach(([key, value]) => {
    workspace.awarenessStore.setFlag(
      key as keyof BlockSuiteFeatureFlags,
      value
    );
  });
  workspace.awarenessStore.setFlag(
    'enable_bookmark_operation',
    environment.isDesktop
  );
}

// guid -> Workspace
export const workspaceHashMap = new Map<string, Workspace>();

const workspaceAtomWeakMap = new WeakMap<Workspace, Atom<Promise<Workspace>>>();

const workspaceDownloadedWeakMap = new WeakMap<Workspace, boolean>();

export function getWorkspace(id: string) {
  if (!workspaceHashMap.has(id)) {
    throw new Error('Workspace not found');
  }
  return workspaceHashMap.get(id) as Workspace;
}

const emptyWorkspaceAtom = atom(async () =>
  new Workspace({
    id: 'null',
    isSSR: !isBrowser,
    providerCreators: [],
    blobStorages: [],
  })
    .register(AffineSchemas)
    .register(__unstableSchemas)
);

export function getStaticWorkspace(
  id: string | null
): Atom<Promise<Workspace>> {
  if (id === null) {
    return emptyWorkspaceAtom;
  }
  if (!workspaceHashMap.has(id)) {
    throw new Error('Workspace not found');
  }
  const workspace = workspaceHashMap.get(id) as Workspace;
  if (!workspaceAtomWeakMap.has(workspace)) {
    const baseAtom = atom(async () => {
      if (workspaceDownloadedWeakMap.get(workspace) !== true) {
        const providers = workspace.providers.filter(
          (provider): provider is ActiveDocProvider =>
            'active' in provider && provider.active === true
        );
        for (const provider of providers) {
          provider.sync();
          // we will wait for the necessary providers to be ready
          await provider.whenReady;
        }
        workspaceDownloadedWeakMap.set(workspace, true);
      }
      return workspace;
    });
    workspaceAtomWeakMap.set(workspace, baseAtom);
  }
  return workspaceAtomWeakMap.get(workspace) as Atom<Promise<Workspace>>;
}

export function useStaticWorkspace(id: string | null): Workspace {
  return useAtomValue(getStaticWorkspace(id));
}

/**
 * @internal test only
 */
export const _cleanupBlockSuiteWorkspaceCache = () => workspaceHashMap.clear();

export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour.AFFINE_CLOUD,
  config: {
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace;
export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour.LOCAL,
  config?: {
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace;
export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour,
  config?: {
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace {
  const providerCreators: DocProviderCreator[] = [];
  const prefix: string = config?.cachePrefix ?? '';
  const cacheKey = `${prefix}${id}`;
  if (workspaceHashMap.has(cacheKey)) {
    return workspaceHashMap.get(cacheKey) as Workspace;
  }
  const idGenerator = config?.idGenerator;

  const blobStorages: StoreOptions['blobStorages'] = [];

  if (flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    if (isBrowser) {
      blobStorages.push(createIndexeddbStorage);
      if (isDesktop && runtimeConfig.enableSQLiteProvider) {
        blobStorages.push(createSQLiteStorage);
      }

      // todo: add support for cloud storage
    }
    providerCreators.push(...createAffineProviders());
  } else {
    if (isBrowser) {
      blobStorages.push(createIndexeddbStorage);
      if (isDesktop && runtimeConfig.enableSQLiteProvider) {
        blobStorages.push(createSQLiteStorage);
      }
    }
    providerCreators.push(...createLocalProviders());
  }
  blobStorages.push(createStaticStorage);

  const workspace = new Workspace({
    id,
    isSSR: !isBrowser,
    providerCreators: typeof window === 'undefined' ? [] : providerCreators,
    blobStorages: blobStorages,
    idGenerator,
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  setEditorFlags(workspace);
  workspaceHashMap.set(cacheKey, workspace);
  return workspace;
}
