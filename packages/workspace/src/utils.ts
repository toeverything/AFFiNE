import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { BlobOptionsGetter, Generator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';

const hashMap = new Map<string, Workspace>();
export const createEmptyBlockSuiteWorkspace = (
  id: string,
  blobOptionsGetter?: BlobOptionsGetter,
  idGenerator?: Generator
): Workspace => {
  if (hashMap.has(id)) {
    return hashMap.get(id) as Workspace;
  }
  const workspace = new Workspace({
    id,
    isSSR: typeof window === 'undefined',
    blobOptionsGetter,
    idGenerator,
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  hashMap.set(id, workspace);
  return workspace;
};
