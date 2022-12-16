import { useEffect, useRef } from 'react';
import { Page } from '@blocksuite/store';
import { EventCallBack } from '../interface';

export type UseHistoryUpdated = (page?: Page) => EventCallBack<Page>;

export const useHistoryUpdate: UseHistoryUpdated = page => {
  const callbackQueue = useRef<((page: Page) => void)[]>([]);

  useEffect(() => {
    if (!page) {
      return;
    }

    setTimeout(() => {
      page.signals.historyUpdated.on(() => {
        callbackQueue.current.forEach(callback => {
          callback(page);
        });
      });
    }, 300);

    return () => {
      callbackQueue.current = [];
      page.signals.historyUpdated.dispose();
    };
  }, [page]);

  return callback => {
    callbackQueue.current.push(callback);
  };
};

export default useHistoryUpdate;
