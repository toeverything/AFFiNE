import { useMemo } from 'react';

import { RemWorkspace } from '../shared';
import { useWorkspaces } from './use-workspaces';

export function useWorkspace(workspaceId: string | null): RemWorkspace | null {
  const workspaces = useWorkspaces();
  return useMemo(
    () => workspaces.find(ws => ws.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  );
}
