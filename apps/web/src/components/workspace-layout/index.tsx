import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';
import { PropsWithChildren } from 'react';
import useEnsureWorkspace from '@/hooks/use-ensure-workspace';
import { PageLoading } from '../loading';

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
    <WorkspaceDefender>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </WorkspaceDefender>
  );
};
export default Layout;
