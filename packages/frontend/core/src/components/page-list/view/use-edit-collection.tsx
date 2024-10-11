import type { Collection } from '@affine/env/filter';
import { useMount } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { CreateCollectionModal } from './create-collection';
import {
  EditCollectionModal,
  type EditCollectionMode,
} from './edit-collection/edit-collection';

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
  const { mount } = useMount('useEditCollection');

  useEffect(() => {
    if (!data) return;
    return mount(
      <EditCollectionModal
        init={data?.collection}
        open={!!data}
        mode={data?.mode}
        onOpenChange={close}
        onConfirm={data?.onConfirm ?? (() => {})}
      />
    );
  }, [close, data, mount]);

  return {
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
  const { mount } = useMount('useEditCollectionName');

  useEffect(() => {
    if (!data) return;
    return mount(
      <CreateCollectionModal
        showTips={showTips}
        title={title}
        init={data?.name ?? ''}
        open={!!data}
        onOpenChange={close}
        onConfirm={data?.onConfirm ?? (() => {})}
      />
    );
  }, [close, data, mount, showTips, title]);

  return {
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
