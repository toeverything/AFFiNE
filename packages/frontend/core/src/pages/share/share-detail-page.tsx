import { MainContainer } from '@affine/component/workspace';
import { usePageDocumentTitle } from '@affine/core/hooks/use-global-state';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { fetchWithTraceReport } from '@affine/graphql';
import {
  AffineCloudBlobStorage,
  StaticBlobStorage,
} from '@affine/workspace-impl';
import {
  EmptyBlobStorage,
  LocalBlobStorage,
  LocalSyncStorage,
  Page,
  PageManager,
  ReadonlyMappingSyncStorage,
  RemoteBlobStorage,
  useService,
  useServiceOptional,
  WorkspaceIdContext,
  WorkspaceManager,
  WorkspaceScope,
} from '@toeverything/infra';
import { noop } from 'foxact/noop';
import { useEffect } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import {
  isRouteErrorResponse,
  redirect,
  useLoaderData,
  useRouteError,
} from 'react-router-dom';

import type { PageMode } from '../../atoms';
import { AppContainer } from '../../components/affine/app-container';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { SharePageNotFoundError } from '../../components/share-page-not-found-error';
import { CurrentPageService } from '../../modules/page';
import { CurrentWorkspaceService } from '../../modules/workspace';
import { ShareHeader } from './share-header';

type DocPublishMode = 'edgeless' | 'page';

export type CloudDoc = {
  arrayBuffer: ArrayBuffer;
  publishMode: DocPublishMode;
};

export async function downloadBinaryFromCloud(
  rootGuid: string,
  pageGuid: string
): Promise<CloudDoc | null> {
  const response = await fetchWithTraceReport(
    `/api/workspaces/${rootGuid}/docs/${pageGuid}`,
    {
      priority: 'high',
    }
  );
  if (response.ok) {
    const publishMode = (response.headers.get('publish-mode') ||
      'page') as DocPublishMode;
    const arrayBuffer = await response.arrayBuffer();

    // return both arrayBuffer and publish mode
    return { arrayBuffer, publishMode };
  }

  return null;
}

type LoaderData = {
  pageId: string;
  workspaceId: string;
  publishMode: PageMode;
  pageArrayBuffer: ArrayBuffer;
  workspaceArrayBuffer: ArrayBuffer;
};

function assertDownloadResponse(
  value: CloudDoc | null
): asserts value is CloudDoc {
  if (
    !value ||
    !((value as CloudDoc).arrayBuffer instanceof ArrayBuffer) ||
    typeof (value as CloudDoc).publishMode !== 'string'
  ) {
    throw new Error('value is not a valid download response');
  }
}

export const loader: LoaderFunction = async ({ params }) => {
  const workspaceId = params?.workspaceId;
  const pageId = params?.pageId;
  if (!workspaceId || !pageId) {
    return redirect('/404');
  }

  const [workspaceResponse, pageResponse] = await Promise.all([
    downloadBinaryFromCloud(workspaceId, workspaceId),
    downloadBinaryFromCloud(workspaceId, pageId),
  ]);
  assertDownloadResponse(workspaceResponse);
  const { arrayBuffer: workspaceArrayBuffer } = workspaceResponse;
  assertDownloadResponse(pageResponse);
  const { arrayBuffer: pageArrayBuffer, publishMode } = pageResponse;

  return {
    workspaceId,
    pageId,
    publishMode,
    workspaceArrayBuffer,
    pageArrayBuffer,
  } satisfies LoaderData;
};

export const Component = () => {
  const {
    workspaceId,
    pageId,
    publishMode,
    workspaceArrayBuffer,
    pageArrayBuffer,
  } = useLoaderData() as LoaderData;
  const workspaceManager = useService(WorkspaceManager);

  const currentWorkspace = useService(CurrentWorkspaceService);

  useEffect(() => {
    // create a workspace for share page
    const workspace = workspaceManager.instantiate(
      {
        id: workspaceId,
        flavour: WorkspaceFlavour.AFFINE_CLOUD,
      },
      services => {
        services
          .scope(WorkspaceScope)
          .addImpl(LocalBlobStorage, EmptyBlobStorage)
          .addImpl(RemoteBlobStorage('affine'), AffineCloudBlobStorage, [
            WorkspaceIdContext,
          ])
          .addImpl(RemoteBlobStorage('static'), StaticBlobStorage)
          .addImpl(
            LocalSyncStorage,
            ReadonlyMappingSyncStorage({
              [workspaceId]: new Uint8Array(workspaceArrayBuffer),
              [pageId]: new Uint8Array(pageArrayBuffer),
            })
          );
      }
    );

    workspace.engine.sync
      .waitForSynced()
      .then(() => {
        const { page } = workspace.services
          .get(PageManager)
          .openByPageId(pageId);

        workspace.blockSuiteWorkspace.awarenessStore.setReadonly(
          page.blockSuitePage,
          true
        );

        const currentPage = workspace.services.get(CurrentPageService);

        currentWorkspace.openWorkspace(workspace);
        currentPage.openPage(page);
      })
      .catch(err => {
        console.error(err);
      });
  }, [
    currentWorkspace,
    pageArrayBuffer,
    pageId,
    workspaceArrayBuffer,
    workspaceId,
    workspaceManager,
  ]);

  const page = useServiceOptional(Page);

  usePageDocumentTitle(page?.meta);

  if (!page) {
    return;
  }

  return (
    <AppContainer>
      <MainContainer>
        <ShareHeader
          pageId={page.id}
          publishMode={publishMode}
          blockSuiteWorkspace={page.blockSuitePage.workspace}
        />
        <PageDetailEditor
          isPublic
          publishMode={publishMode}
          workspace={page.blockSuitePage.workspace}
          pageId={page.id}
          onLoad={() => noop}
        />
      </MainContainer>
    </AppContainer>
  );
};

export function ErrorBoundary() {
  const error = useRouteError();
  return isRouteErrorResponse(error) ? (
    <h1>
      {error.status} {error.statusText}
    </h1>
  ) : (
    <SharePageNotFoundError />
  );
}
