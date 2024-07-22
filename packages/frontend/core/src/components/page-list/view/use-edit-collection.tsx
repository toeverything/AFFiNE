import type { Collection } from '@affine/env/filter';
import { useCallback, useState } from 'react';

import { CreateCollectionModal } from './create-collection';
import type { EditCollectionMode } from './edit-collection/edit-collection';
import { EditCollectionModal } from './edit-collection/edit-collection';

export const useEditCollection = () => {
  const [data, setData] = useState<{
    collection: Collection;
    mode?: 'page' | 'rule';
    onConfirm: (collection: Collection) => void;
  }>();
  const close = useCallback((open: boolean) => {
    if (!open) {
      setData(undefined);
    }
  }, []);

  return {
    node: (
      <EditCollectionModal
        init={data?.collection}
        open={!!data}
        mode={data?.mode}
        onOpenChange={close}
        onConfirm={data?.onConfirm ?? (() => {})}
      />
    ),
    open: (
      collection: Collection,
      mode?: EditCollectionMode
    ): Promise<Collection> =>
      new Promise<Collection>(res => {
        setData({
          collection,
          mode,
          onConfirm: collection => {
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
    onConfirm: (name: string) => void;
  }>();
  const close = useCallback((open: boolean) => {
    if (!open) {
      setData(undefined);
    }
  }, []);

  return {
    node: (
      <CreateCollectionModal
        showTips={showTips}
        title={title}
        init={data?.name ?? ''}
        open={!!data}
        onOpenChange={close}
        onConfirm={data?.onConfirm ?? (() => {})}
      />
    ),
    open: (name: string): Promise<string> =>
      new Promise<string>(res => {
        setData({
          name,
          onConfirm: collection => {
            res(collection);
          },
        });
      }),
  };
};
