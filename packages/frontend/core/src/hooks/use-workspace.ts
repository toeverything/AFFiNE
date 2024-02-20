import type { WorkspaceMetadata } from '@toeverything/infra';
import { type Workspace, WorkspaceManager } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useEffect, useState } from 'react';

/**
 * definitely be careful when using this hook, open workspace is a heavy operation
 */
export function useWorkspace(meta?: WorkspaceMetadata | null) {
  const workspaceManager = useService(WorkspaceManager);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!meta) {
      setWorkspace(null); // set to null if meta is null or undefined
      return;
    }
    const ref = workspaceManager.open(meta);
    setWorkspace(ref.workspace);
    return () => {
      ref.release();
    };
  }, [meta, workspaceManager]);

  return workspace;
}
