import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { SignInPanel, type SignInStep } from '@affine/core/components/sign-in';
import { DefaultServerService, type Server } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { MobileSignInLayout } from './layout';

export const MobileSignInPanel = ({
  onClose,
  server,
  initStep,
}: {
  onClose: () => void;
  server?: string;
  initStep?: SignInStep;
}) => {
  const workspacesService = useService(WorkspacesService);
  const defaultServerService = useService(DefaultServerService);
  const { jumpToPage } = useNavigateHelper();

  const onAuthenticated = useCallback(
    (status: AuthSessionStatus, authedServer?: Server) => {
      if (status !== 'authenticated') {
        return;
      }

      // On mobile the active server (globalContext.serverId) is set ONLY when a
      // workspace layout mounts (see mobile/pages/workspace/layout.tsx). The iOS
      // native layer reads that value via window.getCurrentServerBaseUrl(), so
      // after a self-hosted sign-in — which authenticates the server but never
      // opens one of its workspaces — the app stays anchored to the default cloud
      // server. Fix: when signing into a self-hosted (non-default) server, navigate
      // into one of its workspaces so it becomes the active server. Cloud/default
      // sign-in keeps the previous behavior (just close).
      if (!authedServer || authedServer.id === defaultServerService.server.id) {
        onClose();
        return;
      }

      const openServerWorkspace = () => {
        const workspace = workspacesService.list.workspaces$.value.find(
          w => w.flavour === authedServer.id
        );
        if (!workspace) {
          return false;
        }
        jumpToPage(workspace.id, 'home');
        onClose();
        return true;
      };

      // Already synced → navigate immediately.
      if (openServerWorkspace()) {
        return;
      }

      // The freshly-signed-in server's workspace list may not have synced yet;
      // wait briefly for a workspace to appear, then navigate. Fall back to just
      // closing (same end-state as today) if none shows up.
      let timer: ReturnType<typeof setTimeout>;
      const subscription = workspacesService.list.workspaces$.subscribe(() => {
        if (openServerWorkspace()) {
          subscription.unsubscribe();
          clearTimeout(timer);
        }
      });
      timer = setTimeout(() => {
        subscription.unsubscribe();
        onClose();
      }, 10000);
    },
    [defaultServerService, jumpToPage, onClose, workspacesService]
  );

  return (
    <MobileSignInLayout>
      <SignInPanel
        onSkip={onClose}
        onAuthenticated={onAuthenticated}
        server={server}
        initStep={initStep}
      />
    </MobileSignInLayout>
  );
};
