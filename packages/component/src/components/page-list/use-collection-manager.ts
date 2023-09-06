import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import type { Atom } from 'jotai/vanilla';
import { useCallback, useEffect, useState } from 'react';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

export interface StorageCRUD<Value> {
  get: (key: string) => Promise<Value | null>;
  set: (key: string, value: Value) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}

type StorageCRUDAtom = Atom<StorageCRUD<Collection>>;

const defaultCollection = {
  id: NIL,
  name: 'All',
  filterList: [],
  workspaceId: 'temporary',
};
const collectionAtom = atomWithReset<{
  currentId: string;
  defaultCollection: Collection;
}>({
  currentId: NIL,
  defaultCollection: defaultCollection,
});

const refreshCollection = (
  storage: StorageCRUD<Collection>,
  signal?: AbortSignal
): Promise<Collection[]> => {
  return storage
    .list()
    .then(async keys => {
      if (signal?.aborted) {
        return [];
      }
      return await Promise.all(keys.map(key => storage.get(key))).then(v =>
        v.filter((v): v is Collection => v !== null)
      );
    })
    .catch(error => {
      console.error('Failed to load collections', error);
      return [];
    });
};

export const useSavedCollections = (storageAtom: StorageCRUDAtom) => {
  const storage = useAtomValue(storageAtom);
  const [savedCollections, setSavedCollections] = useState<Collection[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    refreshCollection(storage, controller.signal)
      .then(setSavedCollections)
      .catch(error => {
        console.error('Failed to load collections', error);
      });
    return () => {
      controller.abort();
    };
  }, [storage]);

  const saveCollection = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        return;
      }
      await storage.set(collection.id, collection);
      setSavedCollections(await refreshCollection(storage));
    },
    [storage]
  );
  const deleteCollection = useCallback(
    async (id: string) => {
      if (id === NIL) {
        return;
      }
      await storage.delete(id);
      setSavedCollections(await refreshCollection(storage));
    },
    [storage]
  );
  const addPage = useCallback(
    async (collectionId: string, pageId: string) => {
      const collection = await storage.get(collectionId);
      if (!collection) {
        return;
      }
      await storage.set(collectionId, {
        ...collection,
        allowList: [pageId, ...(collection.allowList ?? [])],
      });
      setSavedCollections(await refreshCollection(storage));
    },
    [storage]
  );
  return {
    savedCollections,
    saveCollection,
    deleteCollection,
    addPage,
  };
};

export const useCollectionManager = (storageAtom: StorageCRUDAtom) => {
  const { savedCollections, saveCollection, deleteCollection, addPage } =
    useSavedCollections(storageAtom);
  const [collectionData, setCollectionData] = useAtom(collectionAtom);

  const updateCollection = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        setCollectionData({
          ...collectionData,
          defaultCollection: collection,
        });
      } else {
        await saveCollection(collection);
      }
    },
    [collectionData, saveCollection, setCollectionData]
  );
  const selectCollection = useCallback(
    (id: string) => {
      setCollectionData({
        ...collectionData,
        currentId: id,
      });
    },
    [collectionData, setCollectionData]
  );
  const backToAll = useCallback(() => {
    setCollectionData(RESET);
  }, [setCollectionData]);
  const setTemporaryFilter = useCallback(
    (filterList: Filter[]) => {
      setCollectionData({
        currentId: NIL,
        defaultCollection: {
          ...defaultCollection,
          filterList: filterList,
        },
      });
    },
    [setCollectionData]
  );
  const currentCollection =
    collectionData.currentId === NIL
      ? collectionData.defaultCollection
      : savedCollections.find(v => v.id === collectionData.currentId) ??
        collectionData.defaultCollection;
  return {
    currentCollection: currentCollection,
    savedCollections,
    isDefault: currentCollection.id === NIL,

    // actions
    saveCollection,
    updateCollection,
    selectCollection,
    backToAll,
    deleteCollection,
    addPage,
    setTemporaryFilter,
  };
};
export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);
