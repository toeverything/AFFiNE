import type { Filter, VariableMap, View } from '@affine/env/filter';
import type { DBSchema } from 'idb';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb/build/entry';
import { useAtom } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import { useCallback } from 'react';
import useSWRImmutable from 'swr/immutable';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';

type PersistenceView = View;

export interface PageViewDBV1 extends DBSchema {
  view: {
    key: PersistenceView['id'];
    value: PersistenceView;
  };
}

const pageViewDBPromise: Promise<IDBPDatabase<PageViewDBV1>> =
  typeof window === 'undefined'
    ? // never resolve in SSR
      new Promise<any>(() => {})
    : openDB<PageViewDBV1>('page-view', 1, {
        upgrade(database) {
          database.createObjectStore('view', {
            keyPath: 'id',
          });
        },
      });

const currentViewAtom = atomWithReset<View>({
  name: 'All',
  id: NIL,
  filterList: [],
});

export const useAllPageSetting = () => {
  const { data: savedViews, mutate } = useSWRImmutable<View[]>(
    ['affine', 'page-view'],
    {
      fetcher: async () => {
        const db = await pageViewDBPromise;
        const t = db.transaction('view').objectStore('view');
        return await t.getAll();
      },
      suspense: true,
      fallbackData: [],
      revalidateOnMount: true,
    }
  );

  const [currentView, setCurrentView] = useAtom(currentViewAtom);

  const createView = useCallback(
    async (view: View) => {
      if (view.id === NIL) {
        return;
      }
      const db = await pageViewDBPromise;
      const t = db.transaction('view', 'readwrite').objectStore('view');
      await t.put(view);
      await mutate();
    },
    [mutate]
  );
  const deleteView = useCallback(
    async (id: string) => {
      if (id === NIL) {
        return;
      }
      const db = await pageViewDBPromise;
      const t = db.transaction('view', 'readwrite').objectStore('view');
      await t.delete(id);
      await mutate();
    },
    [mutate]
  );
  const updateView = useCallback(
    (view: View) => {
      createView(view)
        .then(() => {
          setCurrentView(view);
        })
        .catch(err => {
          console.error(err);
        });
    },
    [createView, setCurrentView]
  );
  const backToAll = useCallback(() => {
    setCurrentView(RESET);
  }, [setCurrentView]);
  return {
    currentView,
    savedViews: savedViews ?? [],
    isDefault: currentView.id === NIL,

    // actions
    createView,
    updateView,
    backToAll,
    deleteView,
  };
};
export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);
