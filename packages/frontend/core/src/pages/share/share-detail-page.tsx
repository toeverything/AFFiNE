import { Scrollable } from '@affine/component';
import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { usePageDocumentTitle } from '@affine/core/hooks/use-global-state';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { fetchWithTraceReport } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  AffineCloudBlobStorage,
  StaticBlobStorage,
} from '@affine/workspace-impl';
import { noop } from '@blocksuite/global/utils';
import { Logo1Icon } from '@blocksuite/icons';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc as BlockSuiteDoc } from '@blocksuite/store';
import type { Doc } from '@toeverything/infra';
import {
  EmptyBlobStorage,
  LocalBlobStorage,
  LocalSyncStorage,
  PageManager,
  type PageMode,
  ReadonlyMappingSyncStorage,
  RemoteBlobStorage,
  ServiceProviderContext,
  useLiveData,
  useService,
  WorkspaceIdContext,
  WorkspaceManager,
  WorkspaceScope,
} from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import {
  isRouteErrorResponse,
  redirect,
  useLoaderData,
  useRouteError,
} from 'react-router-dom';

import { AppContainer } from '../../components/affine/app-container';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { SharePageNotFoundError } from '../../components/share-page-not-found-error';
import { MainContainer } from '../../components/workspace';
import { CurrentWorkspaceService } from '../../modules/workspace';
import * as styles from './share-detail-page.css';
import { ShareFooter } from './share-footer';
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
  const t = useAFFiNEI18N();
  const [page, setPage] = useState<Doc | null>(null);
  const [_, setActiveBlocksuiteEditor] = useActiveBlocksuiteEditor();

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
        const { page } = workspace.services.get(PageManager).open(pageId);

        workspace.docCollection.awarenessStore.setReadonly(
          page.blockSuiteDoc,
          true
        );

        currentWorkspace.openWorkspace(workspace);
        setPage(page);
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

  const pageTitle = useLiveData(page?.title);

  usePageDocumentTitle(pageTitle);
  const loginStatus = useCurrentLoginStatus();

  const onEditorLoad = useCallback(
    (_: BlockSuiteDoc, editor: AffineEditorContainer) => {
      setActiveBlocksuiteEditor(editor);
      return noop;
    },
    [setActiveBlocksuiteEditor]
  );

  if (!page) {
    return;
  }

  return (
    <ServiceProviderContext.Provider value={page.services}>
      <AppContainer>
        <MainContainer>
          <div className={styles.root}>
            <div className={styles.mainContainer}>
              <ShareHeader
                pageId={page.id}
                publishMode={publishMode}
                docCollection={page.blockSuiteDoc.collection}
              />
              <Scrollable.Root>
                <Scrollable.Viewport className={styles.editorContainer}>
                  <PageDetailEditor
                    isPublic
                    publishMode={publishMode}
                    docCollection={page.blockSuiteDoc.collection}
                    pageId={page.id}
                    onLoad={onEditorLoad}
                  />
                  {publishMode === 'page' ? <ShareFooter /> : null}
                </Scrollable.Viewport>
                <Scrollable.Scrollbar />
              </Scrollable.Root>
              {loginStatus !== 'authenticated' ? (
                <a
                  href="https://affine.pro"
                  target="_blank"
                  className={styles.link}
                  rel="noreferrer"
                >
                  <span className={styles.linkText}>
                    {t['com.affine.share-page.footer.built-with']()}
                  </span>
                  <Logo1Icon fontSize={20} />
                </a>
              ) : null}
            </div>
          </div>
        </MainContainer>
      </AppContainer>
    </ServiceProviderContext.Provider>
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
