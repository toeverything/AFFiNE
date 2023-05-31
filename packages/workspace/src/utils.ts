import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Generator, StoreOptions } from '@blocksuite/store';
import { createIndexeddbStorage, Workspace } from '@blocksuite/store';

import type { createWorkspaceApis } from './affine/api';
import { rootStore, rootWorkspacesMetadataAtom } from './atom';
import { createAffineBlobStorage } from './blob';
import { createSQLiteStorage } from './blob/sqlite-blob-storage';
import { WorkspaceFlavour } from './type';

export function cleanupWorkspace(flavour: WorkspaceFlavour) {
  rootStore.set(rootWorkspacesMetadataAtom, metas =>
    metas.filter(meta => meta.flavour !== flavour)
  );
}

const hashMap = new Map<string, Workspace>();

/**
 * @internal test only
 */
export const _cleanupBlockSuiteWorkspaceCache = () => hashMap.clear();

export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour.AFFINE,
  config: {
    workspaceApis: ReturnType<typeof createWorkspaceApis>;
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace;
export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour.LOCAL,
  config?: {
    workspaceApis?: ReturnType<typeof createWorkspaceApis>;
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace;
export function createEmptyBlockSuiteWorkspace(
  id: string,
  flavour: WorkspaceFlavour,
  config?: {
    workspaceApis?: ReturnType<typeof createWorkspaceApis>;
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace {
  if (
    flavour === WorkspaceFlavour.AFFINE &&
    !config?.workspaceApis?.getBlob &&
    !config?.workspaceApis?.uploadBlob
  ) {
    throw new Error('workspaceApis is required for affine flavour');
  }
  const prefix: string = config?.cachePrefix ?? '';
  const cacheKey = `${prefix}${id}`;
  if (hashMap.has(cacheKey)) {
    return hashMap.get(cacheKey) as Workspace;
  }
  const idGenerator = config?.idGenerator;

  const blobStorages: StoreOptions['blobStorages'] = [];

  if (flavour === WorkspaceFlavour.AFFINE) {
    blobStorages.push(id =>
      createAffineBlobStorage(id, config!.workspaceApis!)
    );
  } else {
    if (typeof window !== 'undefined') {
      blobStorages.push(createIndexeddbStorage);
      if (environment.isDesktop) {
        blobStorages.push(createSQLiteStorage);
      }
    }
  }

  const workspace = new Workspace({
    id,
    isSSR: typeof window === 'undefined',
    blobStorages: blobStorages,
    idGenerator,
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
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

  add(cb: () => void) {
    if (this.ready) {
      cb();
      return this;
    }
    if (this.has(cb)) {
      return this;
    }
    return super.add(cb);
  }

  delete(cb: () => void) {
    if (this.has(cb)) {
      return super.delete(cb);
    }
    return false;
  }
}
