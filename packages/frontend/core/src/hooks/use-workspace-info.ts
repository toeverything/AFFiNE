import { workspaceManagerAtom } from '@affine/core/modules/workspace';
import type { WorkspaceMetadata } from '@affine/workspace';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

import { useWorkspaceBlobObjectUrl } from './use-workspace-blob';

export function useWorkspaceInfo(meta: WorkspaceMetadata) {
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
  }, [meta, workspaceManager]);

  return information;
}

export function useWorkspaceName(meta: WorkspaceMetadata) {
  const information = useWorkspaceInfo(meta);

  return information?.name;
}

export function useWorkspaceAvatar(meta: WorkspaceMetadata) {
  const information = useWorkspaceInfo(meta);
  const avatar = useWorkspaceBlobObjectUrl(meta, information?.avatar);

  return avatar;
}
