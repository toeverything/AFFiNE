import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledWrapper } from './styles';
import { PropsWithChildren } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { useInitWorkspace } from '@/hooks/use-init-workspace';

export const WorkspaceDefender = ({ children }: PropsWithChildren) => {
  const { synced } = useAppState();
  const { loading } = useInitWorkspace(!synced);

  return <>{!loading ? children : null}</>;
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
