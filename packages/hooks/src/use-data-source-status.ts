import type { Status, StatusAdapter } from '@affine/y-provider';
import { noop } from 'foxact/noop';
import { useCallback, useSyncExternalStore } from 'react';

type UIStatus =
  | Status
  | {
      type: 'unknown';
    };

export function useDataSourceStatus(datasource: StatusAdapter): UIStatus {
  return useSyncExternalStore(
    useCallback(
      onStoreChange => {
        if (datasource.subscribeStatusChange) {
          return datasource.subscribeStatusChange(onStoreChange);
        } else {
          return noop;
        }
      },
      [datasource]
    ),
    useCallback(() => {
      if (datasource.getStatus) {
        return datasource.getStatus();
      } else {
        return {
          type: 'unknown',
        };
      }
    }, [datasource])
  );
}
