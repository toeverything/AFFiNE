import { isBrowser, isDesktop } from '@affine/env/constant';
import type { BlockSuiteFeatureFlags } from '@affine/env/global';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createAffineProviders,
  createLocalProviders,
} from '@affine/workspace/providers';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type {
  DocProviderCreator,
  Generator,
  StoreOptions,
} from '@blocksuite/store';
import { createIndexeddbStorage, Workspace } from '@blocksuite/store';
import { rootStore } from '@toeverything/plugin-infra/manager';

import { rootWorkspacesMetadataAtom } from './atom';
import { createStaticStorage } from './blob/local-static-storage';
import { createSQLiteStorage } from './blob/sqlite-blob-storage';

export function cleanupWorkspace(flavour: WorkspaceFlavour) {
  rootStore
    .set(rootWorkspacesMetadataAtom, metas =>
      metas.filter(meta => meta.flavour !== flavour)
    )
    .catch(console.error);
}

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

const hashMap = new Map<string, Workspace>();

/**
 * @internal test only
 */
export const _cleanupBlockSuiteWorkspaceCache = () => hashMap.clear();

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
  if (hashMap.has(cacheKey)) {
    return hashMap.get(cacheKey) as Workspace;
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
  hashMap.set(cacheKey, workspace);
  return workspace;
}

export class CallbackSet extends Set<() => void> {
  #ready = false;

  get ready(): boolean {
    return this.#ready;
  }

  set ready(v: boolean) {
    this.#ready = v;
  }

  override add(cb: () => void) {
    if (this.ready) {
      cb();
      return this;
    }
    if (this.has(cb)) {
      return this;
    }
    return super.add(cb);
  }

  override delete(cb: () => void) {
    if (this.has(cb)) {
      return super.delete(cb);
    }
    return false;
  }
}
