import {
  type DocMeta,
  type DocSnapshot,
  type Schema,
  Transformer,
  type Workspace,
} from '@blocksuite/store';

export type ImportBlob = {
  blobId: string;
  sourcePath: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
};

export type ImportIconData =
  | {
      type: 'emoji';
      unicode: string;
    }
  | {
      type: 'image';
      content: string;
    };

export type ImportFolder = {
  path: string;
  name: string;
  parentPath?: string;
  pageId?: string;
  icon?: ImportIconData;
};

export type ImportDoc = {
  id: string;
  sourcePath?: string;
  snapshot: DocSnapshot;
  meta?: Partial<
    Pick<
      DocMeta,
      'title' | 'createDate' | 'updatedDate' | 'tags' | 'favorite' | 'trash'
    >
  >;
};

export type ImportTag = {
  name: string;
  docIds: string[];
};

export type ImportIcon = {
  docId: string;
  icon: ImportIconData;
};

export type ImportWarning = {
  code: string;
  message: string;
  sourcePath?: string;
};

export type ImportBatch = {
  docs: ImportDoc[];
  blobs: ImportBlob[];
  folders?: ImportFolder[];
  tags?: ImportTag[];
  icons?: ImportIcon[];
  warnings?: ImportWarning[];
  progress?: {
    completed: number;
    total: number;
  };
  entryId?: string;
  isWorkspaceFile?: boolean;
  done: boolean;
};

export type ImportCommitResult = {
  docIds: string[];
  entryId?: string;
  isWorkspaceFile?: boolean;
  rootFolderId?: string;
  warnings: ImportWarning[];
};

export async function blobsFromAssets(
  assets: ReadonlyMap<string, File>,
  pathBlobIdMap: ReadonlyMap<string, string> = new Map()
) {
  const sourcePathByBlobId = new Map<string, string>();
  for (const [path, blobId] of pathBlobIdMap) {
    sourcePathByBlobId.set(blobId, path);
  }

  return Promise.all(
    Array.from(
      assets,
      async ([blobId, file]): Promise<ImportBlob> => ({
        blobId,
        sourcePath: sourcePathByBlobId.get(blobId) ?? file.name,
        fileName: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
    )
  );
}

function copyToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function commitImportBatchToWorkspace(
  collection: Workspace,
  schema: Schema,
  batch: ImportBatch
): Promise<ImportCommitResult> {
  for (const blob of batch.blobs) {
    await collection.blobSync.set(
      blob.blobId,
      new File([copyToArrayBuffer(blob.bytes)], blob.fileName, {
        type: blob.mime,
      })
    );
  }

  const transformer = new Transformer({
    schema,
    blobCRUD: collection.blobSync,
    docCRUD: {
      create: (id: string) => collection.createDoc(id).getStore({ id }),
      get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => collection.removeDoc(id),
    },
    middlewares: [],
  });

  const docIds: string[] = [];
  for (const doc of batch.docs) {
    const store = await transformer.snapshotToDoc(doc.snapshot);
    if (!store) continue;
    docIds.push(store.id);
    if (doc.meta && Object.keys(doc.meta).length) {
      collection.meta.setDocMeta(store.id, doc.meta);
    }
  }

  return {
    docIds,
    entryId: batch.entryId,
    isWorkspaceFile: batch.isWorkspaceFile,
    warnings: batch.warnings ?? [],
  };
}
