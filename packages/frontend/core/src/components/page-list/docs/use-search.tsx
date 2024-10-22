import type { DocMeta } from '@blocksuite/affine/store';
import { useState } from 'react';

export const useSearch = (list: DocMeta[]) => {
  const [value, onChange] = useState('');
  return {
    searchText: value,
    updateSearchText: onChange,
    searchedList: value
      ? list.filter(v => v.title.toLowerCase().includes(value.toLowerCase()))
      : list,
  };
};
