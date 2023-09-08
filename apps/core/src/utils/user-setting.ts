import type { Collection } from '@affine/env/filter';
import type { Workspace } from '@blocksuite/store';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Atom } from 'jotai';
import { atom } from 'jotai';
import { getSession } from 'next-auth/react';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';

export interface StorageCRUD<Value> {
  get: (key: string) => Promise<Value | null>;
  set: (key: string, value: Value) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}

export interface PageCollectionDBV1 extends DBSchema {
  view: {
    key: Collection['id'];
    value: Collection;
  };
}

const pageCollectionDBPromise: Promise<IDBPDatabase<PageCollectionDBV1>> =
  openDB<PageCollectionDBV1>('page-view', 1, {
    upgrade(database) {
      database.createObjectStore('view', {
        keyPath: 'id',
      });
    },
  });

const defaultCRUD: StorageCRUD<Collection> = {
  get: async (key: string) => {
    const db = await pageCollectionDBPromise;
    const t = db.transaction('view').objectStore('view');
    return (await t.get(key)) ?? null;
  },
  set: async (key: string, value: Collection) => {
    const db = await pageCollectionDBPromise;
    const t = db.transaction('view', 'readwrite').objectStore('view');
    await t.put(value);
    return key;
  },
  delete: async (key: string) => {
    const db = await pageCollectionDBPromise;
    const t = db.transaction('view', 'readwrite').objectStore('view');
    await t.delete(key);
  },
  list: async () => {
    const db = await pageCollectionDBPromise;
    const t = db.transaction('view').objectStore('view');
    return t.getAllKeys();
  },
};

const storageSettingAtomWeakMap = new WeakMap<
  Workspace,
  Atom<StorageCRUD<Collection>>
>();

export async function syncStorageCRUD(
  from: StorageCRUD<Collection>,
  to: StorageCRUD<Collection>
) {
  const keys = await from.list();
  for (const key of keys) {
    const value = await from.get(key);
    if (value != null) {
      await to.set(key, value);
    }
  }
}

const isCloudStorageEnabled = async (): Promise<string | false> => {
  const session = await getSession();
  return session?.user.id ?? false;
};

const getCloudStorage = async (workspace: Workspace) => {
  const userId = await isCloudStorageEnabled();
  if (!userId) {
    return;
  }
  // need sync from local indexeddb after user enable affine cloud
  const rootDoc = workspace.doc;
  const settingMap = rootDoc.getMap('settings') as YMap<YDoc>;
  if (!settingMap.has(userId)) {
    settingMap.set(
      userId,
      new YDoc({
        guid: `${rootDoc.guid}:settings:${userId}`,
      })
    );
  }
  const settingDoc = settingMap.get(userId) as YDoc;
  const viewMap = settingDoc.getMap('view') as YMap<Collection>;
  return {
    get: async (key: string) => {
      return viewMap.get(key) ?? null;
    },
    set: async (key: string, value: Collection) => {
      viewMap.set(key, value);
      return key;
    },
    delete: async (key: string) => {
      viewMap.delete(key);
    },
    list: async () => {
      return Array.from(viewMap.keys());
    },
  };
};

export function getStorageAtom(
  workspace: Workspace
): Atom<StorageCRUD<Collection>> {
  if (!storageSettingAtomWeakMap.has(workspace)) {
    storageSettingAtomWeakMap.set(
      workspace,
      atom<StorageCRUD<Collection>>(() => {
        return {
          get: async key => {
            const cloudStorage = await getCloudStorage(workspace);

            return cloudStorage?.get(key) ?? (await defaultCRUD.get(key));
          },
          set: async (key, value) => {
            const cloudStorage = await getCloudStorage(workspace);
            if (cloudStorage) {
              await cloudStorage.set(key, value);
            }
            return await defaultCRUD.set(key, value);
          },
          delete: async key => {
            const cloudStorage = await getCloudStorage(workspace);
            if (cloudStorage) {
              await cloudStorage.delete(key);
            }
            return await defaultCRUD.delete(key);
          },
          list: async () => {
            const cloudStorage = await getCloudStorage(workspace);
            if (cloudStorage) {
              return [
                ...new Set<string>([
                  ...(await cloudStorage.list()),
                  ...(await defaultCRUD.list()),
                ]).values(),
              ];
            }
            return defaultCRUD.list();
          },
        };
      })
    );
  }
  return storageSettingAtomWeakMap.get(workspace) as Atom<
    StorageCRUD<Collection>
  >;
}
