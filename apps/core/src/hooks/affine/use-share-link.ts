'use client';
import { useMemo } from 'react';

export function useShareLink(workspaceId: string): string {
  return useMemo(() => {
    if (environment.isServer) {
      throw new Error('useShareLink is not available on server side');
    }
    if (environment.isDesktop) {
      return '???';
    } else {
      return origin + '/share/' + workspaceId;
    }
  }, [workspaceId]);
}
