import { useMount } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { CreateCollectionModal } from './create-collection';

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
