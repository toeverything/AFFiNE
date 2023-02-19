import { Page } from '@blocksuite/store';
import { useEffect, useRef } from 'react';

import { useGlobalState } from '@/store/app';

export type EventCallBack<T> = (callback: (props: T) => void) => void;
export type UseHistoryUpdated = (page?: Page) => EventCallBack<Page>;

export const useHistoryUpdate: UseHistoryUpdated = () => {
  const currentPage = useGlobalState(store => store.currentPage);
  const callbackQueue = useRef<((page: Page) => void)[]>([]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }

    setTimeout(() => {
      currentPage.signals.historyUpdated.on(() => {
        callbackQueue.current.forEach(callback => {
          callback(currentPage);
        });
      });
    }, 300);

    return () => {
      callbackQueue.current = [];
      currentPage.signals.historyUpdated.dispose();
    };
  }, [currentPage]);

  return callback => {
    callbackQueue.current.push(callback);
  };
};

export default useHistoryUpdate;
