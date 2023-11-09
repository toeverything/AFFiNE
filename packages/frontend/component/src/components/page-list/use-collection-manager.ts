import type {
  Collection,
  DeleteCollectionInfo,
  Filter,
  VariableMap,
} from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';
import { type Atom, useAtom, useAtomValue } from 'jotai';
import { atomWithReset } from 'jotai/utils';
import { useCallback } from 'react';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

export const createEmptyCollection = (
  id: string,
  data?: Partial<Omit<Collection, 'id'>>
): Collection => {
  return {
    id,
    name: '',
    filterList: [],
    allowList: [],
    ...data,
  };
};
const defaultCollection: Collection = createEmptyCollection(NIL, {
  name: 'All',
});
const defaultCollectionAtom = atomWithReset<Collection>(defaultCollection);
export const currentCollectionAtom = atomWithReset<string>(NIL);

export type Updater<T> = (value: T) => T;
export type CollectionUpdater = Updater<Collection>;
export type CollectionsCRUD = {
  addCollection: (...collections: Collection[]) => Promise<void>;
  collections: Collection[];
  updateCollection: (id: string, updater: CollectionUpdater) => Promise<void>;
  deleteCollection: (
    info: DeleteCollectionInfo,
    ...ids: string[]
  ) => Promise<void>;
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
  const currentCollectionId = useAtomValue(currentCollectionAtom);
  const [defaultCollection, updateDefaultCollection] = useAtom(
    defaultCollectionAtom
  );
  const update = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        updateDefaultCollection(collection);
      } else {
        await updateCollection(collection.id, () => collection);
      }
    },
    [updateDefaultCollection, updateCollection]
  );
  const setTemporaryFilter = useCallback(
    (filterList: Filter[]) => {
      updateDefaultCollection({
        ...defaultCollection,
        filterList: filterList,
      });
    },
    [updateDefaultCollection, defaultCollection]
  );
  const currentCollection =
    currentCollectionId === NIL
      ? defaultCollection
      : collections.find(v => v.id === currentCollectionId) ??
        defaultCollection;
  return {
    currentCollection: currentCollection,
    savedCollections: collections,
    isDefault: currentCollectionId === NIL,

    // actions
    createCollection: addCollection,
    updateCollection: update,
    deleteCollection,
    addPage,
    setTemporaryFilter,
  };
};
export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);

export const filterPage = (collection: Collection, page: PageMeta) => {
  if (collection.filterList.length === 0) {
    return collection.allowList.includes(page.id);
  }
  return filterPageByRules(collection.filterList, collection.allowList, page);
};
export const filterPageByRules = (
  rules: Filter[],
  allowList: string[],
  page: PageMeta
) => {
  if (allowList?.includes(page.id)) {
    return true;
  }
  return filterByFilterList(rules, {
    'Is Favourited': !!page.favorite,
    Created: page.createDate,
    Updated: page.updatedDate ?? page.createDate,
    Tags: page.tags,
  });
};
