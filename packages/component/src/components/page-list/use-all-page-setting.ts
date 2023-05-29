import dayjs from 'dayjs';
import type { DBSchema } from 'idb';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb/build/entry';
import { useAtom } from 'jotai';
import { atomWithReset } from 'jotai/utils';
import { useCallback } from 'react';
import useSWRImmutable from 'swr/immutable';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';
import type { Filter, VariableMap } from './filter/vars';
import type { Literal } from './filter/vars';

export type View = {
  id: string;
  name: string;
  filterList: Filter[];
};

type PersistenceView = Omit<View, 'filterList'> & {
  filterList: (Omit<Filter, 'args'> & {
    args: (Omit<Literal, 'value'> & {
      value: string;
    })[];
  })[];
};

export interface PageViewDBV1 extends DBSchema {
  view: {
    key: PersistenceView['id'];
    value: PersistenceView;
  };
}

const pageViewDBPromise: Promise<IDBPDatabase<PageViewDBV1>> =
  environment.isServer
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
  name: 'default',
  id: NIL,
  filterList: [],
});

export const useAllPageSetting = () => {
  const { data: savedViews, mutate } = useSWRImmutable(
    ['affine', 'page-view'],
    {
      fetcher: async () => {
        const db = await pageViewDBPromise;
        const t = db.transaction('view').objectStore('view');
        const all = await t.getAll();
        return all.map(view => ({
          ...view,
          filterList: view.filterList.map(filter => ({
            ...filter,
            args: filter.args.map(arg => ({
              ...arg,
              value: dayjs(arg.value),
            })),
          })),
        }));
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
      const persistenceView: PersistenceView = {
        ...view,
        filterList: view.filterList.map(filter => {
          return {
            ...filter,
            args: filter.args.map(arg => {
              return {
                type: arg.type,
                // @ts-expect-error
                value: arg.value.toString(),
              };
            }),
          };
        }),
      };
      await t.put(persistenceView);
      await mutate();
    },
    [mutate]
  );

  return {
    currentView,
    savedViews: savedViews as View[],

    // actions
    createView,
    setCurrentView,
  };
};
export const filterByView = (view: View, varMap: VariableMap) =>
  evalFilterList(view.filterList, varMap);
