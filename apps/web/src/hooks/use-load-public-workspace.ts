import { useRouter } from 'next/router';
import useSWR from 'swr';
import { WorkspaceUnit } from '@affine/datacenter';

export function useLoadPublicWorkspace(workspaceId: string) {
  const router = useRouter();
  const {
    data: workspace,
    error,
    isLoading,
  } = useSWR<WorkspaceUnit>(workspaceId);
  if (error) {
    // todo(himself65): use error boundary
    console.error('loading error', error);
    throw router.push('/404');
  }

  return { isLoading, workspace };
}
