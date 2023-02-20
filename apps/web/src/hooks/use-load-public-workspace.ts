import { WorkspaceUnit } from '@affine/datacenter';
import { dataCenterPromise } from '@affine/store';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

// fixme(himself65): remove with suspense mode
export function useLoadPublicWorkspace(workspaceId: string | null) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceUnit | null>();
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>(
    'loading'
  );

  useEffect(() => {
    setStatus('loading');

    const init = async () => {
      if (workspaceId === null) {
        return;
      }
      const dataCenter = await dataCenterPromise;

      dataCenter
        .loadPublicWorkspace(workspaceId)
        .then(data => {
          setWorkspace(data);
          setStatus('success');
        })
        .catch(() => {
          // if (!cancel) {
          //   router.push('/404');
          // }
          setStatus('error');
        });
    };
    init();
  }, [router, workspaceId]);

  return { status, workspace };
}
