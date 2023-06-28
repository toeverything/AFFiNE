import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import type { DBSchema } from 'idb';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb/build/entry';
import { useAtom } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import { useCallback } from 'react';
import useSWRImmutable from 'swr/immutable';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

type PersistenceCollection = Collection;

export interface PageCollectionDBV1 extends DBSchema {
  view: {
    key: PersistenceCollection['id'];
    value: PersistenceCollection;
  };
}

const pageCollectionDBPromise: Promise<IDBPDatabase<PageCollectionDBV1>> =
  typeof window === 'undefined'
    ? // never resolve in SSR
      new Promise<any>(() => {})
    : openDB<PageCollectionDBV1>('page-view', 1, {
        upgrade(database) {
          database.createObjectStore('view', {
            keyPath: 'id',
          });
        },
      });

const currentCollectionAtom = atomWithReset<Collection>({
  name: 'All',
  id: NIL,
  filterList: [],
});

export const useSavedCollections = () => {
  const { data: savedCollections, mutate } = useSWRImmutable<Collection[]>(
    ['affine', 'page-collection'],
    {
      fetcher: async () => {
        const db = await pageCollectionDBPromise;
        const t = db.transaction('view').objectStore('view');
        return await t.getAll();
      },
      suspense: true,
      fallbackData: [],
      revalidateOnMount: true,
    }
  );
  const saveCollection = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        return;
      }
      const db = await pageCollectionDBPromise;
      const t = db.transaction('view', 'readwrite').objectStore('view');
      await t.put(collection);
      await mutate();
    },
    [mutate]
  );
  const deleteCollection = useCallback(
    async (id: string) => {
      if (id === NIL) {
        return;
      }
      const db = await pageCollectionDBPromise;
      const t = db.transaction('view', 'readwrite').objectStore('view');
      await t.delete(id);
      await mutate();
    },
    [mutate]
  );
  const addPage = useCallback(
    async (collectionId: string, pageId: string) => {
      const collection = savedCollections?.find(v => v.id === collectionId);
      if (!collection) {
        return;
      }
      await saveCollection({
        ...collection,
        allowList: [pageId, ...(collection.allowList ?? [])],
      });
    },
    [saveCollection, savedCollections]
  );
  return {
    savedCollections: savedCollections ?? [],
    saveCollection,
    deleteCollection,
    addPage,
  };
};

export const useAllPageSetting = () => {
  const { savedCollections, saveCollection, deleteCollection, addPage } =
    useSavedCollections();
  const [currentCollection, setCurrentCollection] = useAtom(
    currentCollectionAtom
  );

  const updateCollection = useCallback(
    (collection: Collection) => {
      return saveCollection(collection)
        .then(() => {
          if (collection.id === currentCollection.id) {
            setCurrentCollection(collection);
          }
        })
        .catch(err => {
          console.error(err);
        });
    },
    [currentCollection.id, saveCollection, setCurrentCollection]
  );
  const selectCollection = useCallback(
    (id: string) => {
      const collection = savedCollections.find(v => v.id === id);
      if (collection) {
        setCurrentCollection(collection);
      }
    },
    [savedCollections, setCurrentCollection]
  );
  const backToAll = useCallback(() => {
    setCurrentCollection(RESET);
  }, [setCurrentCollection]);
  return {
    currentCollection: currentCollection,
    savedCollections: savedCollections,
    isDefault: currentCollection.id === NIL,

    // actions
    saveCollection,
    updateCollection,
    selectCollection,
    backToAll,
    deleteCollection,
    addPage,
  };
};
export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);
