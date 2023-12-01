import type { Filter } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';
import { type MouseEvent, useCallback, useState } from 'react';

import { filterPageByRules } from '../../use-collection-manager';

export const useFilter = (list: PageMeta[]) => {
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
    filteredList: list.filter(v => {
      if (v.trash) {
        return false;
      }
      return filterPageByRules(filters, [], v);
    }),
  };
};
