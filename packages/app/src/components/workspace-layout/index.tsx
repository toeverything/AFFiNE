import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledWrapper } from './styles';
import { PropsWithChildren } from 'react';
import useEnsureWorkspace from '@/hooks/use-ensure-workspace';
import { PageLoading } from '@/components/loading';

export const WorkspaceDefender = ({ children }: PropsWithChildren) => {
  const { workspaceLoaded } = useEnsureWorkspace();
  return <>{workspaceLoaded ? children : <PageLoading />}</>;
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
