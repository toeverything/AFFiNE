import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/components/hooks/use-navigate-helper';
import { SignInPanel, type SignInStep } from '@affine/core/components/sign-in';
import { AuthService, type Server } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { MobileSignInLayout } from './layout';

const POST_SIGN_IN_WORKSPACE_REVALIDATE_DELAYS = [
  0, 500, 1000, 2000, 4000, 7500, 12_000, 20_000,
];

const sleep = (ms: number) =>
  new Promise(resolve => window.setTimeout(resolve, ms));

const serverWorkspaces = (workspaces: WorkspaceMetadata[], serverId: string) =>
  workspaces.filter(workspace => workspace.flavour === serverId);

export const MobileSignInPanel = ({
  onClose,
  server,
  initStep,
  showCloseButton = false,
}: {
  onClose: () => void;
  server?: string;
  initStep?: SignInStep;
  showCloseButton?: boolean;
}) => {
  const workspacesService = useService(WorkspacesService);
  const { jumpToPage } = useNavigateHelper();

  const openCloudWorkspaceAfterSignIn = useCallback(
    async (signedInServer: Server) => {
      const authService = signedInServer.scope.get(AuthService);
      authService.session.revalidate();

      for (const delay of POST_SIGN_IN_WORKSPACE_REVALIDATE_DELAYS) {
        if (delay > 0) {
          await sleep(delay);
        }

        await workspacesService.list.waitForRevalidation();
        const workspaces = serverWorkspaces(
          workspacesService.list.workspaces$.value,
          signedInServer.id
        );

        if (workspaces.length > 0) {
          const lastWorkspaceId = localStorage.getItem('last_workspace_id');
          const nextWorkspace =
            workspaces.find(workspace => workspace.id === lastWorkspaceId) ??
            workspaces[0];

          const workspaceRef = workspacesService.open({
            metadata: nextWorkspace,
          });
          void workspaceRef.workspace.engine.doc
            .resetSync()
            .catch(error => {
              console.error(
                'Failed to reset workspace sync after sign in',
                error
              );
            })
            .finally(workspaceRef.dispose);

          jumpToPage(nextWorkspace.id, 'home', RouteLogic.REPLACE, {
            search: new URLSearchParams({
              server: signedInServer.baseUrl,
              flavour: signedInServer.id,
            }),
          });
          return;
        }
      }
    },
    [jumpToPage, workspacesService]
  );

  const onAuthenticated = useCallback(
    (status: AuthSessionStatus, signedInServer: Server) => {
      if (status === 'authenticated') {
        onClose();
        void openCloudWorkspaceAfterSignIn(signedInServer).catch(error => {
          console.error('Failed to open cloud workspace after sign in', error);
        });
      }
    },
    [onClose, openCloudWorkspaceAfterSignIn]
  );

  return (
    <MobileSignInLayout showCloseButton={showCloseButton} onClose={onClose}>
      <SignInPanel
        onSkip={onClose}
        onAuthenticated={onAuthenticated}
        server={server}
        initStep={initStep}
      />
    </MobileSignInLayout>
  );
};
