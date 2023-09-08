import type { StorageCRUD, Subscribe } from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import type { Workspace } from '@blocksuite/store';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Atom } from 'jotai';
import { atom } from 'jotai';
import { getSession } from 'next-auth/react';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';

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

const defaultSet = new Set<Subscribe>();
const workspaceWeakMap = new WeakMap<Workspace, Set<Subscribe>>();

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
  on: subscribe => {
    defaultSet.add(subscribe);
    return () => {
      defaultSet.delete(subscribe);
    };
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
  settingDoc.load();
  const viewMap = settingDoc.getMap('view') as YMap<Collection>;
  viewMap.observe(() => {
    workspaceWeakMap.get(workspace)?.forEach(cb => cb());
  });
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
            const localValue = await defaultCRUD.get(key);
            if (localValue) {
              return localValue;
            }
            return cloudStorage?.get(key) ?? null;
          },
          set: async (key, value) => {
            const cloudStorage = await getCloudStorage(workspace);
            if (cloudStorage) {
              return await cloudStorage.set(key, value);
            }
            return await defaultCRUD.set(key, value);
          },
          delete: async key => {
            const cloudStorage = await getCloudStorage(workspace);
            if (cloudStorage) {
              await cloudStorage.delete(key);
            }
            await defaultCRUD.delete(key);
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
          on: subscribe => {
            if (!workspaceWeakMap.has(workspace)) {
              workspaceWeakMap.set(workspace, new Set());
            }
            const set = workspaceWeakMap.get(workspace) as Set<Subscribe>;
            set.add(subscribe);
            return () => {
              set.delete(subscribe);
            };
          },
        };
      })
    );
  }
  return storageSettingAtomWeakMap.get(workspace) as Atom<
    StorageCRUD<Collection>
  >;
}
