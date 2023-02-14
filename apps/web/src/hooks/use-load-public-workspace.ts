import { getDataCenter, WorkspaceUnit } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export function useLoadPublicWorkspace(workspaceId: string) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceUnit | null>();
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>(
    'loading'
  );

  useEffect(() => {
    setStatus('loading');

    const init = async () => {
      const dataCenter = await getDataCenter();

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
