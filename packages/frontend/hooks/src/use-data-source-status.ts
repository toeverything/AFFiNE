import { useCallback, useSyncExternalStore } from 'react';
import type { DataSourceAdapter, Status } from 'y-provider';

type UIStatus =
  | Status
  | {
      type: 'unknown';
    };

export function useDataSourceStatus(provider: DataSourceAdapter): UIStatus {
  return useSyncExternalStore(
    provider.subscribeStatusChange,
    useCallback(() => provider.status, [provider])
  );
}
