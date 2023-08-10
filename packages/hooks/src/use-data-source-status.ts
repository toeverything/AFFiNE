import type { Status, StatusAdapter } from '@affine/y-provider';
import { useCallback, useSyncExternalStore } from 'react';

type UIStatus =
  | Status
  | {
      type: 'unknown';
    };

export function useDataSourceStatus(datasource: StatusAdapter): UIStatus {
  return useSyncExternalStore(
    datasource.subscribeStatusChange,
    useCallback(() => datasource.status, [datasource])
  );
}
