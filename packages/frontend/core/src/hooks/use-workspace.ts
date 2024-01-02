import type { Workspace } from '@affine/workspace';
import { workspaceManagerAtom } from '@affine/workspace/atom';
import type { WorkspaceMetadata } from '@affine/workspace/metadata';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

/**
 * definitely be careful when using this hook, open workspace is a heavy operation
 */
export function useWorkspace(meta?: WorkspaceMetadata | null) {
  const workspaceManager = useAtomValue(workspaceManagerAtom);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!meta) {
      setWorkspace(null); // set to null if meta is null or undefined
      return;
    }
    const ref = workspaceManager.use(meta);
    setWorkspace(ref.workspace);
    return () => {
      ref.release();
    };
  }, [meta, workspaceManager]);

  return workspace;
}
