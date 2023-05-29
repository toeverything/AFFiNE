import type { DBSchema } from 'idb';
import { openDB } from 'idb';
import { useCallback, useState } from 'react';
import useSWRImmutable from 'swr/immutable';
import { NIL } from 'uuid';

import { evalFilterList } from './filter';
import type { Filter, VariableMap } from './filter/vars';

export type View = {
  id: string;
  name: string;
  filterList: Filter[];
};

export interface PageViewDBV1 extends DBSchema {
  view: {
    key: View['id'];
    value: View;
  };
}

const pageViewDBPromise = openDB<PageViewDBV1>('page-view', 1, {
  upgrade(database) {
    database.createObjectStore('view', {
      keyPath: 'id',
    });
  },
});

export const defaultView = {
  name: 'default',
  id: NIL,
  filterList: [],
};

export const useAllPageSetting = () => {
  const { data: savedViews, mutate } = useSWRImmutable(
    ['affine', 'page-view'],
    {
      fetcher: async () => {
        const db = await pageViewDBPromise;
        const t = db.transaction('view').objectStore('view');
        return t.getAll();
      },
      suspense: true,
      fallbackData: [],
    }
  );

  const [currentView, setCurrentView] = useState<View>(() => defaultView);

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
