import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { BlobOptionsGetter, Generator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';

const hashMap = new Map<string, Workspace>();
export const createEmptyBlockSuiteWorkspace = (
  id: string,
  blobOptionsGetter?: BlobOptionsGetter,
  config?: {
    cachePrefix?: string;
    idGenerator?: Generator;
  }
): Workspace => {
  const prefix: string = config?.cachePrefix ?? '';
  const cacheKey = `${prefix}${id}`;
  if (hashMap.has(cacheKey)) {
    return hashMap.get(cacheKey) as Workspace;
  }
  const idGenerator = config?.idGenerator;
  const workspace = new Workspace({
    id,
    isSSR: typeof window === 'undefined',
    blobOptionsGetter,
    idGenerator,
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  hashMap.set(cacheKey, workspace);
  return workspace;
};
