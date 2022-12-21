import HelpIsland from '@/components/help-island';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import { useRouter } from 'next/router';
import { StyledPage, StyledWrapper } from './styles';
import { AppStateProvider } from '@/providers/app-state-provider/provider';
import ConfirmProvider from '@/providers/confirm-provider';
import { ModalProvider } from '@/providers/global-modal-provider';
import ProviderComposer from '@/components/provider-composer';
import { PropsWithChildren } from 'react';

export const WorkspaceLayout = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  return (
    <ProviderComposer
      contexts={[
        <AppStateProvider key="appStateProvider" />,
        <ModalProvider key="ModalProvider" />,
        <ConfirmProvider key="ConfirmProvider" />,
      ]}
    >
      <StyledPage>
        <WorkSpaceSliderBar />
        <StyledWrapper>
          {children}
          <HelpIsland
            showList={router.query.pageId ? undefined : ['contact']}
          />
        </StyledWrapper>
      </StyledPage>
    </ProviderComposer>
  );
};

export default WorkspaceLayout;
