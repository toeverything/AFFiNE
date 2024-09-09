import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { WorkspaceLayoutProviders } from '@affine/core/layouts/workspace-layout';
import { SWRConfigProvider } from '@affine/core/providers/swr-config-provider';
import type { Workspace, WorkspaceMetadata } from '@toeverything/infra';
import {
  FrameworkScope,
  GlobalContextService,
  useLiveData,
  useServices,
  WorkspacesService,
} from '@toeverything/infra';
import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { MobileCurrentWorkspaceModals } from '../../provider/model-provider';

// TODO(@forehalo): reuse the global context with [core/electron]
declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: Workspace | undefined;
  // eslint-disable-next-line no-var
  var exportWorkspaceSnapshot: (docs?: string[]) => Promise<void>;
  // eslint-disable-next-line no-var
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
  const { workspacesService, globalContextService } = useServices({
    WorkspacesService,
    GlobalContextService,
  });

  const [workspace, setWorkspace] = useState<Workspace | null>(null);

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
      globalContextService.globalContext.workspaceId.set(workspace.id);
      return () => {
        window.currentWorkspace = undefined;
        globalContextService.globalContext.workspaceId.set(null);
      };
    }
    return;
  }, [globalContextService, workspace]);

  const isRootDocReady =
    useLiveData(workspace?.engine.rootDocState$.map(v => v.ready)) ?? false;

  if (!workspace) {
    return null; // skip this, workspace will be set in layout effect
  }

  if (!isRootDocReady) {
    return (
      <FrameworkScope scope={workspace.scope}>
        <AppFallback />
      </FrameworkScope>
    );
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <AffineErrorBoundary height="100dvh">
        <SWRConfigProvider>
          <MobileCurrentWorkspaceModals />
          <WorkspaceLayoutProviders>{children}</WorkspaceLayoutProviders>
        </SWRConfigProvider>
      </AffineErrorBoundary>
    </FrameworkScope>
  );
};
