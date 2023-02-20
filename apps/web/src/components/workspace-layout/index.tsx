import { useGlobalState } from '@affine/store';
import { useRouter } from 'next/router';
import { PropsWithChildren, useEffect } from 'react';

import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouterTargetWorkspace } from '@/hooks/use-router-target-workspace';

import { PageLoading } from '../loading';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';

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
  const { targetWorkspace, exist } = useRouterTargetWorkspace();
  const router = useRouter();
  const loadWorkspace = useGlobalState(store => store.loadWorkspace);
  useEffect(() => {
    if (!exist) {
      router.replace('/404');
    }
  }, [exist, router]);
  useEffect(() => {
    if (exist && targetWorkspace) {
      loadWorkspace(targetWorkspace.id);
    }
  }, [exist, loadWorkspace, targetWorkspace]);
  if (!targetWorkspace) {
    return <PageLoading />;
  }
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
};
export default Layout;
