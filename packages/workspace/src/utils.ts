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
import { INTERNAL_BLOCKSUITE_HASH_MAP } from '@toeverything/hooks/use-block-suite-workspace';

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
  if (INTERNAL_BLOCKSUITE_HASH_MAP.has(cacheKey)) {
    return INTERNAL_BLOCKSUITE_HASH_MAP.get(cacheKey) as Workspace;
  }
  const idGenerator = config?.idGenerator;

  const blobStorages: StoreOptions['blobStorages'] = [];

  if (flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    if (isBrowser) {
      blobStorages.push(createIndexeddbStorage);
      if (isDesktop && runtimeConfig.enableSQLiteProvider) {
        blobStorages.push(createSQLiteStorage);
      }

      // todo(JimmFly): add support for cloud storage
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
  INTERNAL_BLOCKSUITE_HASH_MAP.set(cacheKey, workspace);
  return workspace;
}
