import { useCallback, useEffect, useState } from 'react';

import { useCurrentPageId } from './current/use-current-page-id';
import { useCurrentWorkspace } from './current/use-current-workspace';

const kLastOpenedWorkspaceKey = 'affine-last-opened-workspace';
const kLastOpenedPageKey = 'affine-last-opened-page';

export function useLastOpenedWorkspace(): [
  string | null,
  string | null,
  () => void
] {
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId] = useCurrentPageId();
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null);
  const [lastPageId, setLastPageId] = useState<string | null>(null);
  useEffect(() => {
    const lastWorkspaceId = localStorage.getItem(kLastOpenedWorkspaceKey);
    if (lastWorkspaceId) {
      setLastWorkspaceId(lastWorkspaceId);
    }
    const lastPageId = localStorage.getItem(kLastOpenedPageKey);
    if (lastPageId) {
      setLastPageId(lastPageId);
    }
  }, []);
  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem(kLastOpenedWorkspaceKey, currentWorkspace.id);
    }
    if (currentPageId) {
      localStorage.setItem(kLastOpenedPageKey, currentPageId);
    }
  }, [currentPageId, currentWorkspace]);
  const refresh = useCallback(() => {
    localStorage.removeItem(kLastOpenedWorkspaceKey);
    localStorage.removeItem(kLastOpenedPageKey);
  }, []);
  return [lastWorkspaceId, lastPageId, refresh];
}
