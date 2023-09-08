import type { CollectionsAtom } from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { DisposableGroup } from '@blocksuite/global/utils';
import { currentWorkspaceAtom } from '@toeverything/infra/atom';
import { type DBSchema, openDB } from 'idb';
import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import { Observable } from 'rxjs';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';

import { sessionAtom } from '../atoms/cloud-user';

export interface PageCollectionDBV1 extends DBSchema {
  view: {
    key: Collection['id'];
    value: Collection;
  };
}

export interface StorageCRUD<Value> {
  get: (key: string) => Promise<Value | null>;
  set: (key: string, value: Value) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}

type Subscribe = () => void;

const collectionDBAtom = atom(
  openDB<PageCollectionDBV1>('page-view', 1, {
    upgrade(database) {
      database.createObjectStore('view', {
        keyPath: 'id',
      });
    },
  })
);

const callbackSet = new Set<Subscribe>();

const localCollectionCRUDAtom = atom(get => ({
  get: async (key: string) => {
    const db = await get(collectionDBAtom);
    const t = db.transaction('view').objectStore('view');
    return (await t.get(key)) ?? null;
  },
  set: async (key: string, value: Collection) => {
    const db = await get(collectionDBAtom);
    const t = db.transaction('view', 'readwrite').objectStore('view');
    await t.put(value);
    callbackSet.forEach(cb => cb());
    return key;
  },
  delete: async (key: string) => {
    const db = await get(collectionDBAtom);
    const t = db.transaction('view', 'readwrite').objectStore('view');
    callbackSet.forEach(cb => cb());
    await t.delete(key);
  },
  list: async () => {
    const db = await get(collectionDBAtom);
    const t = db.transaction('view').objectStore('view');
    return t.getAllKeys();
  },
}));

const getCollections = async (
  storage: StorageCRUD<Collection>
): Promise<Collection[]> => {
  return storage
    .list()
    .then(async keys => {
      return await Promise.all(keys.map(key => storage.get(key))).then(v =>
        v.filter((v): v is Collection => v !== null)
      );
    })
    .catch(error => {
      console.error('Failed to load collections', error);
      return [];
    });
};

const pageCollectionBaseAtom = atomWithObservable<Collection[]>(get => {
  const currentWorkspacePromise = get(currentWorkspaceAtom);
  const session = get(sessionAtom);
  const localCRUD = get(localCollectionCRUDAtom);
  const userId = session?.data?.user.id ?? null;

  const useLocalStorage = userId === null;

  return new Observable<Collection[]>(subscriber => {
    if (useLocalStorage) {
      getCollections(localCRUD).then(collections => {
        subscriber.next(collections);
      });
      const fn = () => {
        getCollections(localCRUD).then(collections => {
          subscriber.next(collections);
        });
      };
      callbackSet.add(fn);
      return () => {
        callbackSet.delete(fn);
      };
    } else {
      const group = new DisposableGroup();
      const abortController = new AbortController();
      currentWorkspacePromise.then(async currentWorkspace => {
        if (abortController.signal.aborted) {
          return;
        }
        const collectionsFromLocal = await getCollections(localCRUD);
        const rootDoc = currentWorkspace.doc;
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
        if (!settingDoc.isLoaded) {
          settingDoc.load();
        }
        const viewMap = settingDoc.getMap('view') as YMap<Collection>;
        const collectionsFromDoc: Collection[] = Array.from(viewMap.keys())
          .map(key => viewMap.get(key))
          .filter((v): v is Collection => !!v);
        const collections = [...collectionsFromLocal, ...collectionsFromDoc];
        subscriber.next(collections);
        if (group.disposed) {
          return;
        }
        console.log('collectionsFromDoc');
        const fn = () => {
          console.log('collectionsFromDoc');
          // todo: simplify
          const collectionsFromDoc: Collection[] = Array.from(viewMap.keys())
            .map(key => viewMap.get(key))
            .filter((v): v is Collection => !!v);
          const collections = [...collectionsFromLocal, ...collectionsFromDoc];
          subscriber.next(collections);
        };
        viewMap.observe(fn);
        group.add(() => {
          viewMap.unobserve(fn);
        });
      });
      return () => {
        group.dispose();
      };
    }
  });
});

export const currentCollectionsAtom: CollectionsAtom = atom(
  get => get(pageCollectionBaseAtom),
  async (get, set, apply) => {
    const collections = await get(pageCollectionBaseAtom);
    let newCollections: Collection[];
    if (typeof apply === 'function') {
      newCollections = apply(collections);
    } else {
      newCollections = apply;
    }
    const session = get(sessionAtom);
    const userId = session?.data?.user.id ?? null;
    const useLocalStorage = userId === null;
    const added = newCollections.filter(v => !collections.includes(v));
    const removed = collections.filter(v => !newCollections.includes(v));
    if (useLocalStorage) {
      const localCRUD = get(localCollectionCRUDAtom);
      await Promise.all([
        ...added.map(async v => {
          await localCRUD.set(v.id, v);
        }),
        ...removed.map(async v => {
          await localCRUD.delete(v.id);
        }),
      ]);
    } else {
      const currentWorkspace = await get(currentWorkspaceAtom);
      const rootDoc = currentWorkspace.doc;
      const settingMap = rootDoc.getMap('settings') as YMap<YDoc>;
      const settingDoc = settingMap.get(userId) as YDoc;
      const viewMap = settingDoc.getMap('view') as YMap<Collection>;
      await Promise.all([
        ...added.map(async v => {
          viewMap.set(v.id, v);
        }),
        ...removed.map(async v => {
          viewMap.delete(v.id);
        }),
      ]);
    }
  }
);
