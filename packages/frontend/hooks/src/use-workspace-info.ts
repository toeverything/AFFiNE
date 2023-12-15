import type { Workspace, WorkspaceMetadata } from '@affine/workspace';
import { workspaceManagerAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

export function useWorkspaceInfo(
  meta: WorkspaceMetadata,
  workspace?: Workspace
) {
  const workspaceManager = useAtomValue(workspaceManagerAtom);

  const [information, setInformation] = useState(
    () => workspaceManager.list.getInformation(meta).info
  );

  useEffect(() => {
    const information = workspaceManager.list.getInformation(meta);

    setInformation(information.info);
    return information.onUpdated.on(info => {
      setInformation(info);
    }).dispose;
  }, [meta, workspace, workspaceManager]);

  return information;
}
