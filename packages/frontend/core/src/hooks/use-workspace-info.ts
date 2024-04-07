import type { WorkspaceMetadata } from '@toeverything/infra';
import {
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { useWorkspaceBlobObjectUrl } from './use-workspace-blob';

export function useWorkspaceInfo(meta: WorkspaceMetadata) {
  const workspacesService = useService(WorkspacesService);

  const [profile, setProfile] = useState(() =>
    workspacesService.getProfile(meta)
  );

  useEffect(() => {
    const profile = workspacesService.getProfile(meta);

    profile.revalidate();

    setProfile(profile);
  }, [meta, workspacesService]);

  return useLiveData(profile.profile$);
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
