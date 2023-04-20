import type { createWorkspaceApis } from '@affine/workspace/affine/api';
import { createAffineBlobStorage } from '@affine/workspace/blob';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Generator } from '@blocksuite/store';
import { createIndexeddbStorage, Workspace } from '@blocksuite/store';

import { WorkspaceFlavour } from './type';

const hashMap = new Map<string, Workspace>();

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
  const workspace = new Workspace({
    id,
    isSSR: typeof window === 'undefined',
    blobStorages:
      flavour === WorkspaceFlavour.AFFINE
        ? [id => createAffineBlobStorage(id, config!.workspaceApis!)]
        : typeof window === 'undefined'
        ? []
        : [createIndexeddbStorage],
    idGenerator,
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  hashMap.set(cacheKey, workspace);
  return workspace;
}
