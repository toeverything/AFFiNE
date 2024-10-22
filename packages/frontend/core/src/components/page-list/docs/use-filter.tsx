import type { Filter } from '@affine/env/filter';
import type { MouseEvent } from 'react';
import { useCallback, useState } from 'react';

import {
  filterPageByRules,
  type PageDataForFilter,
} from '../use-collection-manager';

export const useFilter = (list: PageDataForFilter[]) => {
  const [filters, changeFilters] = useState<Filter[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const clickFilter = useCallback(
    (e: MouseEvent) => {
      if (showFilter || filters.length !== 0) {
        e.stopPropagation();
        e.preventDefault();
        setShowFilter(!showFilter);
      }
    },
    [filters.length, showFilter]
  );
  const onCreateFilter = useCallback(
    (filter: Filter) => {
      changeFilters([...filters, filter]);
      setShowFilter(true);
    },
    [filters]
  );
  return {
    showFilter,
    filters,
    updateFilters: changeFilters,
    clickFilter,
    createFilter: onCreateFilter,
    filteredList: list
      .filter(pageData => {
        if (pageData.meta.trash) {
          return false;
        }
        return filterPageByRules(filters, [], pageData);
      })
      .map(pageData => pageData.meta),
  };
};
