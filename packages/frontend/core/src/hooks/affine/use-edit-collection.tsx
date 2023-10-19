import { EditCollectionModal } from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useCallback, useState } from 'react';

import { useAllPageListConfig } from './use-all-page-list-config';

export const useEditCollection = () => {
  const [data, setData] = useState<{
    collection: Collection;
    onConfirm: (collection: Collection) => Promise<void>;
  }>();
  const close = useCallback(() => setData(undefined), []);
  const config = useAllPageListConfig();

  return {
    node: data ? (
      <EditCollectionModal
        allPageListConfig={config}
        init={data.collection}
        open={!!data}
        onOpenChange={close}
        onConfirm={data.onConfirm}
      />
    ) : null,
    open: (collection: Collection): Promise<Collection> =>
      new Promise<Collection>(res => {
        setData({
          collection,
          onConfirm: async collection => {
            res(collection);
          },
        });
      }),
  };
};
