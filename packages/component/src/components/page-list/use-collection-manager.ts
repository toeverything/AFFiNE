import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import { atom, useAtom, useAtomValue } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import type { Atom } from 'jotai/vanilla';
import type { WritableAtom } from 'jotai/vanilla';
import { useCallback, useEffect } from 'react';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

export type Subscribe = () => void;

export interface StorageCRUD<Value> {
  get: (key: string) => Promise<Value | null>;
  set: (key: string, value: Value) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
  on: (subscribe: Subscribe) => () => void;
}

export type StorageCRUDAtom = Atom<StorageCRUD<Collection>>;

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

const refreshCollection = async (
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

const collectionWeakMap = new WeakMap<
  StorageCRUDAtom,
  WritableAtom<
    Collection | Promise<Collection[]>,
    [Collection[] | ((collection: Collection[]) => Collection[]), boolean],
    void
  >
>();

export const getCollectionAtom = (storageAtom: StorageCRUDAtom) => {
  if (!collectionWeakMap.has(storageAtom)) {
    const firstAtom = atom<Promise<Collection[]>>(async get => {
      const storage = get(storageAtom);
      return refreshCollection(storage);
    });
    const baseAtom = atom<Collection[] | null>(null);
    const proxyAtom = atom<
      Collection | Promise<Collection[]>,
      [Collection[] | ((collection: Collection[]) => Collection[]), boolean],
      void
    >(
      async get => {
        const result = get(baseAtom);
        if (result === null) {
          return await get(firstAtom);
        } else {
          return result;
        }
      },
      (get, set, apply, local: boolean = false) => {
        const fetcher = async () => {
          let old = await get(baseAtom);
          if (old === null) {
            old = await get(firstAtom);
          }
          let newCollections: Collection[];
          if (typeof apply === 'function') {
            newCollections = apply(old);
            set(baseAtom, newCollections);
          } else {
            newCollections = apply;
            set(baseAtom, newCollections);
          }
          if (local) {
            return;
          }
          const o = old;
          const added = newCollections.filter(
            v => !o.some(oldV => oldV.id === v.id)
          );
          const deleted = old.filter(
            v => !newCollections.some(newV => newV.id === v.id)
          );
          const storage = get(storageAtom);
          await Promise.all([
            ...added.map(v => storage.set(v.id, v)),
            ...deleted.map(v => storage.delete(v.id)),
          ]);
        };
        fetcher().catch(error => {
          console.error('Failed to sync collections', error);
        });
      }
    );
    collectionWeakMap.set(storageAtom, proxyAtom);
  }
  return collectionWeakMap.get(storageAtom) as WritableAtom<
    Collection | Promise<Collection[]>,
    [Collection[] | ((collection: Collection[]) => Collection[]), boolean],
    void
  >;
};

export const useSavedCollections = (storageAtom: StorageCRUDAtom) => {
  const [savedCollections, setCollections] = useAtom(
    getCollectionAtom(storageAtom)
  ) as [
    Collection[],
    (
      apply: Collection[] | ((collection: Collection[]) => Collection[]),
      local?: boolean
    ) => void,
  ];

  const storage = useAtomValue(storageAtom);
  useEffect(() => {
    storage.on(() => {
      storage
        .list()
        .then(async keys => {
          const collections = (
            await Promise.all(keys.map(key => storage.get(key)))
          ).filter((v): v is Collection => v != null);
          setCollections(collections, true);
        })
        .catch(error => {
          console.error('failed to list', error);
        });
    });
  }, [setCollections, storage]);

  const saveCollection = useCallback(
    async (collection: Collection) => {
      if (collection.id === NIL) {
        return;
      }
      setCollections(old => [...old, collection]);
    },
    [setCollections]
  );
  const deleteCollection = useCallback(
    async (id: string) => {
      if (id === NIL) {
        return;
      }
      setCollections(old => old.filter(v => v.id !== id));
    },
    [setCollections]
  );
  const addPage = useCallback(
    async (collectionId: string, pageId: string) => {
      setCollections(old => {
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
