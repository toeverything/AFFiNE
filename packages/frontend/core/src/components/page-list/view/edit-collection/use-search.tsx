import type { PageMeta } from '@blocksuite/store';
import { useState } from 'react';

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
