import {
  type AllPageListConfig,
  CreateCollectionModal,
  EditCollectionModal,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useCallback, useState } from 'react';

export const useEditCollection = (config: AllPageListConfig) => {
  const [data, setData] = useState<{
    collection: Collection;
    onConfirm: (collection: Collection) => Promise<void>;
  }>();
  const close = useCallback(() => setData(undefined), []);

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

export const useEditCollectionName = ({
  title,
  showTips,
}: {
  title: string;
  showTips?: boolean;
}) => {
  const [data, setData] = useState<{
    name: string;
    onConfirm: (name: string) => Promise<void>;
  }>();
  const close = useCallback(() => setData(undefined), []);

  return {
    node: data ? (
      <CreateCollectionModal
        showTips={showTips}
        title={title}
        init={data.name}
        open={!!data}
        onOpenChange={close}
        onConfirm={data.onConfirm}
      />
    ) : null,
    open: (name: string): Promise<string> =>
      new Promise<string>(res => {
        setData({
          name,
          onConfirm: async collection => {
            res(collection);
          },
        });
      }),
  };
};
