import { isBrowser } from '@affine/env/constant';
import type { BlockSuiteFeatureFlags } from '@affine/env/global';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { createAffinePublicProviders } from '@affine/workspace/providers';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { DocProviderCreator } from '@blocksuite/store';
import { Schema, Workspace } from '@blocksuite/store';
import { INTERNAL_BLOCKSUITE_HASH_MAP } from '@toeverything/infra/__internal__/workspace';
import { nanoid } from 'nanoid';
import type { Doc } from 'yjs';
import type { Transaction } from 'yjs';

import type { BlobEngine } from '../blob';
import {
  createAffineCloudBlobEngine,
  createAffinePublicBlobEngine,
  createLocalBlobEngine,
} from '../blob';
import { createAffineProviders, createLocalProviders } from '../providers';

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

type UpdateCallback = (
  update: Uint8Array,
  origin: string | number | null,
  doc: Doc,
  transaction: Transaction
) => void;

type SubdocEvent = {
  loaded: Set<Doc>;
  removed: Set<Doc>;
  added: Set<Doc>;
};

const docUpdateCallbackWeakMap = new WeakMap<Doc, UpdateCallback>();

export const globalBlockSuiteSchema = new Schema();

globalBlockSuiteSchema.register(AffineSchemas).register(__unstableSchemas);

const createMonitor = (doc: Doc) => {
  const onUpdate: UpdateCallback = (_, origin) => {
    if (process.env.NODE_ENV === 'development') {
      if (typeof origin !== 'string' && typeof origin !== 'number') {
        console.warn(
          'origin is not a string or number, this will cause problems in the future',
          origin
        );
      }
    } else {
      // todo: add monitor in the future
    }
  };
  docUpdateCallbackWeakMap.set(doc, onUpdate);
  doc.on('update', onUpdate);
  const onSubdocs = (event: SubdocEvent) => {
    event.added.forEach(subdoc => {
      if (!docUpdateCallbackWeakMap.has(subdoc)) {
        createMonitor(subdoc);
      }
    });
    event.removed.forEach(subdoc => {
      if (docUpdateCallbackWeakMap.has(subdoc)) {
        docUpdateCallbackWeakMap.delete(subdoc);
      }
    });
  };
  doc.on('subdocs', onSubdocs);
  doc.on('destroy', () => {
    docUpdateCallbackWeakMap.delete(doc);
    doc.off('update', onSubdocs);
  });
};

const workspaceBlobEngineWeakMap = new WeakMap<Workspace, BlobEngine>();
export function getBlobEngine(workspace: Workspace) {
  // temporary solution to get blob engine from workspace
  return workspaceBlobEngineWeakMap.get(workspace);
}

// if not exist, create a new workspace
export function getOrCreateWorkspace(
  id: string,
  flavour: WorkspaceFlavour
): Workspace {
  const providerCreators: DocProviderCreator[] = [];
  if (INTERNAL_BLOCKSUITE_HASH_MAP.has(id)) {
    return INTERNAL_BLOCKSUITE_HASH_MAP.get(id) as Workspace;
  }

  let blobEngine: BlobEngine;
  if (flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    blobEngine = createAffineCloudBlobEngine(id);
    providerCreators.push(...createAffineProviders());
  } else if (flavour === WorkspaceFlavour.LOCAL) {
    blobEngine = createLocalBlobEngine(id);
    providerCreators.push(...createLocalProviders());
  } else if (flavour === WorkspaceFlavour.AFFINE_PUBLIC) {
    blobEngine = createAffinePublicBlobEngine(id);
    providerCreators.push(...createAffinePublicProviders());
  } else {
    throw new Error('unsupported flavour');
  }

  const workspace = new Workspace({
    id,
    isSSR: !isBrowser,
    providerCreators: typeof window === 'undefined' ? [] : providerCreators,
    blobStorages: [
      () => ({
        crud: {
          async get(key) {
            return (await blobEngine.get(key)) ?? null;
          },
          async set(key, value) {
            await blobEngine.set(key, value);
            return key;
          },
          async delete(key) {
            return blobEngine.delete(key);
          },
          async list() {
            return blobEngine.list();
          },
        },
      }),
    ],
    idGenerator: () => nanoid(),
    schema: globalBlockSuiteSchema,
  });
  workspaceBlobEngineWeakMap.set(workspace, blobEngine);
  createMonitor(workspace.doc);
  setEditorFlags(workspace);
  INTERNAL_BLOCKSUITE_HASH_MAP.set(id, workspace);
  return workspace;
}
