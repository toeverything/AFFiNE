import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import { useAtom } from 'jotai';
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

export const useSavedCollections = (collectionAtom: CollectionsAtom) => {
  const [savedCollections, setCollections] = useAtom(collectionAtom);

  const saveCollection = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        return;
      }
      await setCollections(old => [...old, collection]);
    },
    [setCollections]
  );
  const deleteCollection = useCallback(
    async (id: string) => {
      if (id === NIL) {
        return;
      }
      await setCollections(old => old.filter(v => v.id !== id));
    },
    [setCollections]
  );
  const addPage = useCallback(
    async (collectionId: string, pageId: string) => {
      await setCollections(old => {
        const collection = old.find(v => v.id === collectionId);
        if (!collection) {
          return old;
        }
        return [
          ...old.filter(v => v.id !== collectionId),
          {
            ...collection,
            allowList: [pageId, ...(collection.allowList ?? [])],
          },
        ];
      });
    },
    [setCollections]
  );
  return {
    savedCollections,
    saveCollection,
    deleteCollection,
    addPage,
  };
};

export const useCollectionManager = (collectionsAtom: CollectionsAtom) => {
  const { savedCollections, saveCollection, deleteCollection, addPage } =
    useSavedCollections(collectionsAtom);
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
