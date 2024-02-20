import type { Workspace, WorkspaceStatus } from '@toeverything/infra';
import { useEffect, useState } from 'react';

export function useWorkspaceStatus<
  Selector extends ((status: WorkspaceStatus) => any) | undefined | null,
  Status = Selector extends (status: WorkspaceStatus) => any
    ? ReturnType<Selector>
    : WorkspaceStatus,
>(workspace?: Workspace | null, selector?: Selector): Status | null {
  // avoid re-render when selector is changed
  const [cachedSelector] = useState(() => selector);

  const [status, setStatus] = useState<Status | null>(() => {
    if (!workspace) {
      return null;
    }
    return cachedSelector ? cachedSelector(workspace.status) : workspace.status;
  });

  useEffect(() => {
    if (!workspace) {
      setStatus(null);
      return;
    }
    setStatus(
      cachedSelector ? cachedSelector(workspace.status) : workspace.status
    );
    return workspace.onStatusChange.on(status =>
      setStatus(cachedSelector ? cachedSelector(status) : status)
    ).dispose;
  }, [cachedSelector, workspace]);

  return status;
}
