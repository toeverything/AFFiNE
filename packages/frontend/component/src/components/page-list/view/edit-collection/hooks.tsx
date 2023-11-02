import {
  type AllPageListConfig,
  filterPageByRules,
} from '@affine/component/page-list';
import type { Filter } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';
import { Modal } from '@toeverything/components/modal';
import { type MouseEvent, useCallback, useState } from 'react';

import { SelectPage } from './select-page';
export const useSelectPage = ({
  allPageListConfig,
}: {
  allPageListConfig: AllPageListConfig;
}) => {
  const [value, onChange] = useState<{
    init: string[];
    onConfirm: (ids: string[]) => void;
  }>();
  const close = useCallback(() => {
    onChange(undefined);
  }, []);
  return {
    node: (
      <Modal
        open={!!value}
        onOpenChange={close}
        withoutCloseButton
        width="calc(100% - 32px)"
        height="80%"
        overlayOptions={{ style: { backgroundColor: 'transparent' } }}
        contentOptions={{
          style: {
            padding: 0,
            transform: 'translate(-50%,calc(-50% + 16px))',
            maxWidth: 976,
            backgroundColor: 'var(--affine-white)',
          },
        }}
      >
        {value ? (
          <SelectPage
            allPageListConfig={allPageListConfig}
            init={value.init}
            onConfirm={value.onConfirm}
            onCancel={close}
          />
        ) : null}
      </Modal>
    ),
    open: (init: string[]): Promise<string[]> =>
      new Promise<string[]>(res => {
        onChange({
          init,
          onConfirm: list => {
            close();
            res(list);
          },
        });
      }),
  };
};
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
export const useSearch = (list: PageMeta[]) => {
  const [value, onChange] = useState('');
  return {
    searchText: value,
    updateSearchText: onChange,
    searchedList: value
      ? list.filter(v => v.title.toLowerCase().includes(value.toLowerCase()))
      : list,
  };
};
