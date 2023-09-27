import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import { type Atom, useAtom } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import type { WritableAtom } from 'jotai/vanilla';
import { useCallback } from 'react';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

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

export type CollectionsAtom = WritableAtom<
  Collection[] | Promise<Collection[]>,
  [Collection[] | ((collection: Collection[]) => Collection[])],
  Promise<void>
>;
export type Updater<T> = (value: T) => T;
export type CollectionUpdater = Updater<Collection>;
export type CollectionsCRUD = {
  addCollection: (...collections: Collection[]) => Promise<void>;
  collections: Collection[];
  updateCollection: (id: string, updater: CollectionUpdater) => Promise<void>;
  deleteCollection: (...ids: string[]) => Promise<void>;
};
export type CollectionsCRUDAtom = Atom<CollectionsCRUD>;

export const useSavedCollections = (collectionAtom: CollectionsCRUDAtom) => {
  const [{ collections, addCollection, deleteCollection, updateCollection }] =
    useAtom(collectionAtom);
  const addPage = useCallback(
    async (collectionId: string, pageId: string) => {
      await updateCollection(collectionId, old => {
        return {
          ...old,
          allowList: [pageId, ...(old.allowList ?? [])],
        };
      });
    },
    [updateCollection]
  );
  return {
    collections,
    addCollection,
    updateCollection,
    deleteCollection,
    addPage,
  };
};

export const useCollectionManager = (collectionsAtom: CollectionsCRUDAtom) => {
  const {
    collections,
    updateCollection,
    addCollection,
    deleteCollection,
    addPage,
  } = useSavedCollections(collectionsAtom);
  const [collectionData, setCollectionData] = useAtom(collectionAtom);
  const update = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        setCollectionData({
          ...collectionData,
          defaultCollection: collection,
        });
      } else {
        await updateCollection(collection.id, () => collection);
      }
    },
    [setCollectionData, collectionData, updateCollection]
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
      : collections.find(v => v.id === collectionData.currentId) ??
        collectionData.defaultCollection;
  return {
    currentCollection: currentCollection,
    savedCollections: collections,
    isDefault: currentCollection.id === NIL,

    // actions
    createCollection: addCollection,
    updateCollection: update,
    deleteCollection,
    selectCollection,
    backToAll,
    addPage,
    setTemporaryFilter,
  };
};
export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);
