import type { DBSchema} from 'idb';
import {openDB } from 'idb'
import { useCallback, useState } from "react";
import useSWR from "swr";
import { NIL }from 'uuid'

import { evalFilterList } from './filter';
import type { Filter, VariableMap } from './filter/vars';

export type View = {
  id: string;
  name: string;
  filterList: Filter[];
};

export interface PageViewDBV1 extends DBSchema {
  view: {
    key: View['id']
    value: View
  }
}

const pageViewDBPromise = openDB<PageViewDBV1>('page-view', 1, {
  upgrade (database) {
    database.createObjectStore('view', {
      keyPath: 'id'
    })
  }
})

export const useAllPageSetting = () => {
  const { data: savedViews, mutate } = useSWR(['affine', 'page-view'], {
    fetcher: async () => {
      const db = await pageViewDBPromise
      const t = db.transaction('view').objectStore('view')
      return t.getAll()
    },
    suspense: true,
    fallbackData: []
  })

  const [currentView, setCurrentView] = useState<View>(() => ({
    name: 'default',
    id: NIL,
    filterList: [],
  }));

  const createView = (view: View) => useCallback(async () => {
    view
  }, [])

  return {
    currentView,
    savedViews,

    // actions
    createView,
    setCurrentView,
  };
};
export const filterByView = (view: View, varMap: VariableMap) =>
  evalFilterList(view.filterList, varMap);
