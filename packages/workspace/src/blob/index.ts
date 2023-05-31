import type { createWorkspaceApis } from '@affine/workspace/affine/api';
import type { BlobStorage } from '@blocksuite/store';
import { createIndexeddbStorage } from '@blocksuite/store';
import { openDB } from 'idb';
import type { DBSchema } from 'idb/build/entry';

type UploadingBlob = {
  key: string;
  arrayBuffer: ArrayBuffer;
  type: string;
};

interface AffineBlob extends DBSchema {
  uploading: {
    key: string;
    value: UploadingBlob;
  };
  // todo: migrate blob storage from `createIndexeddbStorage`
}

export const createAffineBlobStorage = (
  workspaceId: string,
  workspaceApis: ReturnType<typeof createWorkspaceApis>
): BlobStorage => {
  const storage = createIndexeddbStorage(workspaceId);
  const dbPromise = openDB<AffineBlob>('affine-blob', 1, {
    upgrade(db) {
      db.createObjectStore('uploading', { keyPath: 'key' });
    },
  });
  dbPromise.then(async db => {
    const t = db.transaction('uploading', 'readwrite').objectStore('uploading');
    await t.getAll().then(blobs =>
      blobs.map(({ arrayBuffer, type }) =>
        workspaceApis.uploadBlob(workspaceId, arrayBuffer, type).then(key => {
          const t = db
            .transaction('uploading', 'readwrite')
            .objectStore('uploading');
          return t.delete(key);
        })
      )
    );
  });
  return {
    crud: {
      get: async key => {
        const blob = await storage.crud.get(key);
        if (!blob) {
          const buffer = await workspaceApis.getBlob(workspaceId, key);
          return new Blob([buffer]);
        } else {
          return blob;
        }
      },
      set: async (key, value) => {
        const db = await dbPromise;
        const arrayBuffer = await value.arrayBuffer();
        const t = db
          .transaction('uploading', 'readwrite')
          .objectStore('uploading');
        let uploaded = false;
        t.put({
          key,
          arrayBuffer,
          type: value.type,
        }).then(() => {
          // delete the uploading blob after uploaded
          if (uploaded) {
            const t = db
              .transaction('uploading', 'readwrite')
              .objectStore('uploading');
            t.delete(key);
          }
        });
        await Promise.all([
          storage.crud.set(key, value),
          workspaceApis
            .uploadBlob(workspaceId, await value.arrayBuffer(), value.type)
            .then(async () => {
              uploaded = true;
              const t = db
                .transaction('uploading', 'readwrite')
                .objectStore('uploading');
              // delete the uploading blob after uploaded
              if (await t.get(key)) {
                await t.delete(key);
              }
            }),
        ]);
        return key;
      },
      delete: async (key: string) => {
        await Promise.all([
          storage.crud.delete(key),
          // we don't support deleting a blob in API?
          // workspaceApis.deleteBlob(workspaceId, key)
        ]);
      },
      list: async () => {
        const blobs = await storage.crud.list();
        // we don't support listing blobs in API?
        return [...blobs];
      },
    },
  };
};
