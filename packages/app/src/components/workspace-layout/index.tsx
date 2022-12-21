import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledWrapper } from './styles';
import { PropsWithChildren } from 'react';

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

export default WorkspaceLayout;
