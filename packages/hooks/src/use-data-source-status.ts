import type { DataSourceAdapter, Status } from '@affine/y-provider';
import { useCallback, useSyncExternalStore } from 'react';

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
