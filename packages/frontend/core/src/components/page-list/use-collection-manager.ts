import type { CollectionService } from '@affine/core/modules/collection';
import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';
import { useLiveData } from '@toeverything/infra/livedata';
import { useAtom, useAtomValue } from 'jotai';
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

export const useSavedCollections = (collectionService: CollectionService) => {
  const addPage = useCallback(
    (collectionId: string, pageId: string) => {
      collectionService.updateCollection(collectionId, old => {
        return {
          ...old,
          allowList: [pageId, ...(old.allowList ?? [])],
        };
      });
    },
    [collectionService]
  );
  return {
    collectionService,
    addPage,
  };
};

export const useCollectionManager = (collectionService: CollectionService) => {
  const collections = useLiveData(collectionService.collections);
  const { addPage } = useSavedCollections(collectionService);
  const currentCollectionId = useAtomValue(currentCollectionAtom);
  const [defaultCollection, updateDefaultCollection] = useAtom(
    defaultCollectionAtom
  );
  const update = useCallback(
    (collection: Collection) => {
      if (collection.id === NIL) {
        updateDefaultCollection(collection);
      } else {
        collectionService.updateCollection(collection.id, () => collection);
      }
    },
    [updateDefaultCollection, collectionService]
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
    createCollection: collectionService.addCollection.bind(collectionService),
    updateCollection: update,
    deleteCollection:
      collectionService.deleteCollection.bind(collectionService),
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
