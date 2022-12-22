import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledWrapper } from './styles';
import { PropsWithChildren, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';

export const WorkspaceDefender = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const { synced, loadWorkspace, workspacesMeta } = useAppState();

  useEffect(() => {
    const initWorkspace = async () => {
      const workspaceId =
        (router.query.workspaceId as string) ||
        workspacesMeta?.[0]?.id ||
        new Date().getTime().toString();

      await loadWorkspace(workspaceId);
      setWorkspaceLoaded(true);
    };
    if (!synced) {
      return;
    }

    initWorkspace();
  }, [
    loadWorkspace,
    router.pathname,
    router.query.workspaceId,
    synced,
    workspaceLoaded,
    workspacesMeta,
  ]);
  return <>{workspaceLoaded ? children : null}</>;
};

export const WorkspaceLayout = ({ children }: PropsWithChildren) => {
  const router = useRouter();

  return (
    <StyledPage>
      <WorkSpaceSliderBar />
      <StyledWrapper>
        {children}
        <HelpIsland showList={router.query.pageId ? undefined : ['contact']} />
      </StyledWrapper>
    </StyledPage>
  );
};

export const Layout = ({ children }: PropsWithChildren) => {
  return (
    <WorkspaceDefender>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </WorkspaceDefender>
  );
};
export default Layout;
