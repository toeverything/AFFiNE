import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceUnit } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export function usePublicWorkspace(workspaceId: string) {
  const { dataCenter } = useAppState();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceUnit>();

  useEffect(() => {
    let cancel = false;
    dataCenter
      .loadPublicWorkspace(workspaceId)
      .then(data => {
        if (!cancel) {
          setWorkspace(data);
        }
      })
      .catch(() => {
        if (!cancel) {
          router.push('/404');
        }
      });
    return () => {
      cancel = true;
    };
  }, [router, workspaceId, dataCenter]);

  return workspace;
}
