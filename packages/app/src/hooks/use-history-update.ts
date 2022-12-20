import { Page } from '@blocksuite/store';
import { useAppState } from '@/providers/app-state-provider';
import { useEffect, useRef } from 'react';

export type EventCallBack<T> = (callback: (props: T) => void) => void;
export type UseHistoryUpdated = (page?: Page) => EventCallBack<Page>;

export const useHistoryUpdate: UseHistoryUpdated = () => {
  const { currentPage } = useAppState();

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
