import { uniReactRoot } from '@affine/component';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { AiLoginRequiredModal } from '@affine/core/components/affine/auth/ai-login-required';
import { SWRConfigProvider } from '@affine/core/components/providers/swr-config-provider';
import { WorkspaceSideEffects } from '@affine/core/components/providers/workspace-side-effects';
import {
  DefaultServerService,
  WorkspaceServerService,
} from '@affine/core/modules/cloud';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import type {
  Workspace,
  WorkspaceMetadata,
} from '@affine/core/modules/workspace';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { FrameworkScope, useServices } from '@toeverything/infra';
import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { WorkspaceDialogs } from '../../dialogs';

// TODO(@forehalo): reuse the global context with [core/electron]
declare global {
  /**
   * @internal debug only
   */
  // oxlint-disable-next-line no-var
  var currentWorkspace: Workspace | undefined;
  // oxlint-disable-next-line no-var
  var exportWorkspaceSnapshot: (docs?: string[]) => Promise<void>;
  // oxlint-disable-next-line no-var
  var importWorkspaceSnapshot: () => Promise<void>;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

export const WorkspaceLayout = ({
  meta,
  children,
}: PropsWithChildren<{ meta: WorkspaceMetadata }>) => {
  // todo: reduce code duplication with packages\frontend\core\src\pages\workspace\index.tsx
  const { workspacesService, globalContextService, defaultServerService } =
    useServices({
      WorkspacesService,
      GlobalContextService,
      DefaultServerService,
    });

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const workspaceServer = workspace?.scope.get(WorkspaceServerService)?.server;

  useLayoutEffect(() => {
    const ref = workspacesService.open({ metadata: meta });
    setWorkspace(ref.workspace);
    return () => {
      ref.dispose();
    };
  }, [meta, workspacesService]);

  useEffect(() => {
    if (workspace) {
      // for debug purpose
      window.currentWorkspace = workspace ?? undefined;
      window.dispatchEvent(
        new CustomEvent('affine:workspace:change', {
          detail: {
            id: workspace.id,
          },
        })
      );
      localStorage.setItem('last_workspace_id', workspace.id);
      localStorage.setItem('last_workspace_flavour', workspace.flavour);
      globalContextService.globalContext.workspaceId.set(workspace.id);
      if (workspaceServer) {
        globalContextService.globalContext.serverId.set(workspaceServer.id);
      }
      globalContextService.globalContext.workspaceFlavour.set(
        workspace.flavour
      );
      return () => {
        window.currentWorkspace = undefined;
        globalContextService.globalContext.workspaceId.set(null);
        if (workspaceServer) {
          globalContextService.globalContext.serverId.set(
            defaultServerService.server.id
          );
        }
        globalContextService.globalContext.workspaceFlavour.set(null);
      };
    }
    return;
  }, [
    defaultServerService.server.id,
    globalContextService,
    workspace,
    workspaceServer,
  ]);

  useEffect(() => {
    if (!BUILD_CONFIG.isIOS || !workspace) {
      return;
    }

    const syncContext = {
      workspaceId: workspace.id,
      workspaceFlavour: workspace.flavour,
      serverBaseUrl: workspaceServer?.baseUrl ?? null,
    };
    console.warn('[AFFiNE][iOS sync] workspace mounted', syncContext);

    if (workspace.flavour === 'local') {
      console.warn(
        '[AFFiNE][iOS sync] workspace is local; remote sync disabled',
        syncContext
      );
      return;
    }

    let lastStateKey = '';
    const subscription = workspace.engine.doc.state$.subscribe(state => {
      const syncState = {
        total: state.total,
        loaded: state.loaded,
        syncing: state.syncing,
        synced: state.synced,
        retrying: state.syncRetrying,
        error: state.syncErrorMessage,
      };
      const stateKey = JSON.stringify(syncState);
      if (stateKey !== lastStateKey) {
        lastStateKey = stateKey;
        console.warn('[AFFiNE][iOS sync] workspace sync state', {
          ...syncContext,
          ...syncState,
        });
      }
    });

    const timers = [0, 5_000, 15_000].map(delay =>
      window.setTimeout(() => {
        console.warn('[AFFiNE][iOS sync] reset workspace sync', {
          ...syncContext,
          delay,
        });
        workspace.engine.doc.resetSync().catch(error => {
          console.warn('[AFFiNE][iOS sync] reset workspace sync failed', {
            ...syncContext,
            error,
          });
        });
      }, delay)
    );

    return () => {
      subscription.unsubscribe();
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [workspace, workspaceServer]);

  if (!workspace) {
    return null; // skip this, workspace will be set in layout effect
  }

  return (
    <FrameworkScope scope={workspaceServer?.scope}>
      <FrameworkScope scope={workspace.scope}>
        <AffineErrorBoundary height="100dvh">
          <SWRConfigProvider>
            <WorkspaceDialogs />

            {/* ---- some side-effect components ---- */}
            <PeekViewManagerModal />
            <AiLoginRequiredModal />
            <uniReactRoot.Root />
            <WorkspaceSideEffects />
            {children}
          </SWRConfigProvider>
        </AffineErrorBoundary>
      </FrameworkScope>
    </FrameworkScope>
  );
};
