import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { WorkspaceLayoutProviders } from '@affine/core/layouts/workspace-layout';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '@affine/core/providers/modal-provider';
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
        <AppFallback key="workspaceLoading" />
        <AllWorkspaceModals />
      </FrameworkScope>
    );
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <AffineErrorBoundary height="100vh">
        <SWRConfigProvider>
          <AllWorkspaceModals />
          <CurrentWorkspaceModals />
          <WorkspaceLayoutProviders>{children}</WorkspaceLayoutProviders>
        </SWRConfigProvider>
      </AffineErrorBoundary>
    </FrameworkScope>
  );
};
