import { uniReactRoot } from '@affine/component';
import { WorkspaceAIOnboarding } from '@affine/core/components/affine/ai-onboarding';
import { AiLoginRequiredModal } from '@affine/core/components/affine/auth/ai-login-required';
import {
  CloudQuotaModal,
  LocalQuotaModal,
} from '@affine/core/components/affine/quota-reached-modal';
import { SWRConfigProvider } from '@affine/core/components/providers/swr-config-provider';
import { WorkspaceSideEffects } from '@affine/core/components/providers/workspace-side-effects';
import { AIIsland } from '@affine/core/desktop/components/ai-island';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { DocumentTitle } from '@affine/core/desktop/components/document-title';
import { WorkspaceDialogs } from '@affine/core/desktop/dialogs';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import { QuotaCheck } from '@affine/core/modules/quota';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import type { PropsWithChildren } from 'react';

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  const currentWorkspace = useService(WorkspaceService).workspace;
  return (
    <SWRConfigProvider>
      <WorkspaceDialogs />

      {/* ---- some side-effect components ---- */}
      {currentWorkspace?.flavour !== 'local' ? (
        <>
          <CloudQuotaModal />
          <QuotaCheck workspaceMeta={currentWorkspace.meta} />
        </>
      ) : (
        <LocalQuotaModal />
      )}
      <AiLoginRequiredModal />
      <WorkspaceSideEffects />
      <PeekViewManagerModal />
      <DocumentTitle />

      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
      <WorkspaceAIOnboarding />
      <AIIsland />
      <uniReactRoot.Root />
    </SWRConfigProvider>
  );
};

/**
 * Wraps the workspace layout main router view
 */
const WorkspaceLayoutUIContainer = ({ children }: PropsWithChildren) => {
  const workbench = useService(WorkbenchService).workbench;
  const currentPath = useLiveData(
    LiveData.computed(get => {
      return get(workbench.basename$) + get(workbench.location$).pathname;
    })
  );

  return (
    <AppContainer data-current-path={currentPath}>{children}</AppContainer>
  );
};
const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  return <WorkspaceLayoutUIContainer>{children}</WorkspaceLayoutUIContainer>;
};
