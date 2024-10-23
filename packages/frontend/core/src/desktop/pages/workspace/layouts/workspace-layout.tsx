import { WorkspaceAIOnboarding } from '@affine/core/components/affine/ai-onboarding';
import { AiLoginRequiredModal } from '@affine/core/components/affine/auth/ai-login-required';
import {
  CloudQuotaModal,
  LocalQuotaModal,
} from '@affine/core/components/affine/quota-reached-modal';
import { CurrentWorkspaceModals } from '@affine/core/components/providers/modal-provider';
import { SWRConfigProvider } from '@affine/core/components/providers/swr-config-provider';
import { WorkspaceSideEffects } from '@affine/core/components/providers/workspace-side-effects';
import { WorkspaceUpgrade } from '@affine/core/components/workspace-upgrade';
import { AIIsland } from '@affine/core/desktop/components/ai-island';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { WorkspaceDialogs } from '@affine/core/desktop/dialogs';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  LiveData,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import type { PropsWithChildren } from 'react';

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  return (
    <SWRConfigProvider>
      {/* load all workspaces is costly, do not block the whole UI */}
      <CurrentWorkspaceModals />
      <WorkspaceDialogs />

      {/* ---- some side-effect components ---- */}
      {currentWorkspace?.flavour === WorkspaceFlavour.LOCAL && (
        <LocalQuotaModal />
      )}
      {currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD && (
        <CloudQuotaModal />
      )}
      <AiLoginRequiredModal />
      <WorkspaceSideEffects />

      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
      <WorkspaceAIOnboarding />
      <AIIsland />
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
export const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  const workspace = useService(WorkspaceService).workspace;

  const upgrading = useLiveData(workspace.upgrade.upgrading$);
  const needUpgrade = useLiveData(workspace.upgrade.needUpgrade$);

  return (
    <WorkspaceLayoutUIContainer>
      {needUpgrade || upgrading ? <WorkspaceUpgrade /> : children}
    </WorkspaceLayoutUIContainer>
  );
};
