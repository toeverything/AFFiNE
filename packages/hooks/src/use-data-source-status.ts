import type { DatasourceDocAdapter, Status } from '@affine/y-provider';
import { noop } from 'foxact/noop';
import { useCallback, useSyncExternalStore } from 'react';

type UIStatus =
  | Status
  | {
      type: 'unknown';
    };

export function useDataSourceStatus(
  datasource: DatasourceDocAdapter
): UIStatus {
  return useSyncExternalStore(
    useCallback(
      onStoreChange => {
        if (datasource.onDocUpdate) {
          return datasource.onDocUpdate(onStoreChange);
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
