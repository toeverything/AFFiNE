import { AffineOtherPageLayout } from '@affine/component/affine-other-page-layout';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { viewRoutes } from '@affine/core/router';
import { ZipTransformer } from '@blocksuite/blocks';
import type { Workspace, WorkspaceMetadata } from '@toeverything/infra';
import {
  FrameworkScope,
  GlobalContextService,
  useLiveData,
  useServices,
  WorkspacesService,
} from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { matchPath, useLocation, useParams } from 'react-router-dom';

import { AffineErrorBoundary } from '../../components/affine/affine-error-boundary';
import { WorkspaceLayout } from '../../layouts/workspace-layout';
import { WorkbenchRoot } from '../../modules/workbench';
import { performanceRenderLogger } from '../../shared';
import { PageNotFound } from '../404';
import { SharePage } from './share/share-page';

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

export const Component = (): ReactElement => {
  performanceRenderLogger.debug('WorkspaceLayout');
  const { workspacesService } = useServices({
    WorkspacesService,
  });

  const params = useParams();
  const location = useLocation();

  // check if we are in detail doc route, if so, maybe render share page
  const detailDocRoute = useMemo(() => {
    const match = matchPath(
      '/workspace/:workspaceId/:docId',
      location.pathname
    );
    if (
      match &&
      match.params.docId &&
      match.params.workspaceId &&
      // TODO(eyhn): need a better way to check if it's a docId
      viewRoutes.find(route => matchPath(route.path, '/' + match.params.docId))
        ?.path === '/:pageId'
    ) {
      return {
        docId: match.params.docId,
        workspaceId: match.params.workspaceId,
      };
    } else {
      return null;
    }
  }, [location.pathname]);

  const [workspaceNotFound, setWorkspaceNotFound] = useState(false);
  const listLoading = useLiveData(workspacesService.list.isRevalidating$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const meta = useMemo(() => {
    return workspaces.find(({ id }) => id === params.workspaceId);
  }, [workspaces, params.workspaceId]);

  // if listLoading is false, we can show 404 page, otherwise we should show loading page.
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      setWorkspaceNotFound(true);
    }
    if (meta) {
      setWorkspaceNotFound(false);
    }
  }, [listLoading, meta, workspacesService]);

  // if workspace is not found, we should revalidate in interval
  useEffect(() => {
    if (listLoading === false && meta === undefined) {
      const timer = setInterval(
        () => workspacesService.list.revalidate(),
        5000
      );
      return () => clearInterval(timer);
    }
    return;
  }, [listLoading, meta, workspaceNotFound, workspacesService]);

  if (workspaceNotFound) {
    if (
      !BUILD_CONFIG.isElectron /* only browser has share page */ &&
      detailDocRoute
    ) {
      return (
        <SharePage
          docId={detailDocRoute.docId}
          workspaceId={detailDocRoute.workspaceId}
        />
      );
    }
    return (
      <AffineOtherPageLayout>
        <PageNotFound noPermission />
      </AffineOtherPageLayout>
    );
  }
  if (!meta) {
    return <AppFallback />;
  }

  return <WorkspacePage meta={meta} />;
};

const WorkspacePage = ({ meta }: { meta: WorkspaceMetadata }) => {
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

  const isRootDocReady =
    useLiveData(workspace?.engine.rootDocState$.map(v => v.ready)) ?? false;

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
      window.exportWorkspaceSnapshot = async (docs?: string[]) => {
        const zip = await ZipTransformer.exportDocs(
          workspace.docCollection,
          Array.from(workspace.docCollection.docs.values())
            .filter(doc => (docs ? docs.includes(doc.id) : true))
            .map(doc => doc.getDoc())
        );
        const url = URL.createObjectURL(zip);
        // download url
        const a = document.createElement('a');
        a.href = url;
        a.download = `${workspace.docCollection.meta.name}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      };
      window.importWorkspaceSnapshot = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = async () => {
          if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const blob = new Blob([file], { type: 'application/zip' });
            const newDocs = await ZipTransformer.importDocs(
              workspace.docCollection,
              blob
            );
            console.log(
              'imported docs',
              newDocs
                .filter(doc => !!doc)
                .map(doc => ({
                  id: doc.id,
                  title: doc.meta?.title,
                }))
            );
          }
        };
        input.click();
      };
      localStorage.setItem('last_workspace_id', workspace.id);
      globalContextService.globalContext.workspaceId.set(workspace.id);
      return () => {
        window.currentWorkspace = undefined;
        globalContextService.globalContext.workspaceId.set(null);
      };
    }
    return;
  }, [globalContextService, workspace]);

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
      <AffineErrorBoundary height="100vh">
        <WorkspaceLayout>
          <WorkbenchRoot />
        </WorkspaceLayout>
      </AffineErrorBoundary>
    </FrameworkScope>
  );
};
