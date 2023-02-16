import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';
import { PropsWithChildren, useCallback } from 'react';
import { useGlobalState, useGlobalStateApi } from '@/store/app';

export const WorkspaceSuspense = ({ children }: PropsWithChildren) => {
  const dataCenter = useGlobalState(useCallback(store => store.dataCenter, []));
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const loadWorkspace = useGlobalState(
    useCallback(store => store.loadWorkspace, [])
  );
  const loadingWorkspacePromise = useGlobalState(
    store => store.loadingWorkspacePromise
  );
  const api = useGlobalStateApi();
  const router = useRouter();
  const isCorrectWorkspace = router.query.workspaceId === currentWorkspace?.id;
  if (loadingWorkspacePromise) {
    throw loadingWorkspacePromise;
  }
  if (!isCorrectWorkspace) {
    const workspaceId =
      typeof router.query.workspaceId === 'string'
        ? router.query.workspaceId
        : dataCenter.workspaces[0]?.id;
    // If router.query.workspaceId is not in workspace list, jump to 404 page
    // If workspaceList is empty, we need to create a default workspace but not jump to 404
    if (
      workspaceId &&
      dataCenter.workspaces.length &&
      dataCenter.workspaces.findIndex(
        meta => meta.id.toString() === workspaceId
      ) === -1
    ) {
      throw router.push('/404');
    }
    const promise = loadWorkspace(workspaceId);
    promise.then(() => api.setState({ loadingWorkspacePromise: null }));
    api.setState({
      loadingWorkspacePromise: promise,
    });
    throw promise;
  }
  return <>{children}</>;
};

export const WorkspaceLayout = ({ children }: PropsWithChildren) => {
  const router = useRouter();

  return (
    <StyledPage>
      <WorkSpaceSliderBar />
      <StyledWrapper>
        {children}
        <StyledToolWrapper>
          <div id="toolWrapper" style={{ marginBottom: '12px' }}>
            {/* Slot for block hub */}
          </div>
          <HelpIsland
            showList={router.query.pageId ? undefined : ['contact']}
          />
        </StyledToolWrapper>
      </StyledWrapper>
    </StyledPage>
  );
};

export const Layout = ({ children }: PropsWithChildren) => {
  return (
    <WorkspaceSuspense>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </WorkspaceSuspense>
  );
};
export default Layout;
