import { Scrollable } from '@affine/component';
import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { usePageDocumentTitle } from '@affine/core/hooks/use-global-state';
import { AuthService } from '@affine/core/modules/cloud';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { noop } from '@blocksuite/global/utils';
import { Logo1Icon } from '@blocksuite/icons/rc';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc as BlockSuiteDoc } from '@blocksuite/store';
import type { Doc, DocMode, Workspace } from '@toeverything/infra';
import {
  DocsService,
  EmptyBlobStorage,
  FrameworkScope,
  ReadonlyDocStorage,
  useLiveData,
  useService,
  WorkspaceFlavourProvider,
  WorkspacesService,
} from '@toeverything/infra';
import clsx from 'clsx';
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
import { PeekViewManagerModal } from '../../modules/peek-view';
import { CloudBlobStorage } from '../../modules/workspace-engine/impls/engine/blob-cloud';
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
  const response = await fetch(`/api/workspaces/${rootGuid}/docs/${pageGuid}`);
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
  publishMode: DocMode;
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
    pageId: docId,
    publishMode,
    workspaceArrayBuffer,
    pageArrayBuffer,
  } = useLoaderData() as LoaderData;
  const workspacesService = useService(WorkspacesService);

  const t = useI18n();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Doc | null>(null);
  const [_, setActiveBlocksuiteEditor] = useActiveBlocksuiteEditor();

  const defaultCloudProvider = workspacesService.framework.get(
    WorkspaceFlavourProvider('CLOUD')
  );

  useEffect(() => {
    // create a workspace for share page
    const { workspace } = workspacesService.open(
      {
        metadata: {
          id: workspaceId,
          flavour: WorkspaceFlavour.AFFINE_CLOUD,
        },
        isSharedMode: true,
      },
      {
        ...defaultCloudProvider,
        getEngineProvider(workspaceId) {
          return {
            getDocStorage() {
              return new ReadonlyDocStorage({
                [workspaceId]: new Uint8Array(workspaceArrayBuffer),
                [docId]: new Uint8Array(pageArrayBuffer),
              });
            },
            getAwarenessConnections() {
              return [];
            },
            getDocServer() {
              return null;
            },
            getLocalBlobStorage() {
              return EmptyBlobStorage;
            },
            getRemoteBlobStorages() {
              return [new CloudBlobStorage(workspaceId)];
            },
          };
        },
      }
    );

    setWorkspace(workspace);

    workspace.engine
      .waitForRootDocReady()
      .then(() => {
        const { doc } = workspace.scope.get(DocsService).open(docId);

        workspace.docCollection.awarenessStore.setReadonly(
          doc.blockSuiteDoc.blockCollection,
          true
        );

        setPage(doc);
      })
      .catch(err => {
        console.error(err);
      });
  }, [
    defaultCloudProvider,
    pageArrayBuffer,
    docId,
    workspaceArrayBuffer,
    workspaceId,
    workspacesService,
  ]);

  const pageTitle = useLiveData(page?.title$);

  usePageDocumentTitle(pageTitle);
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);

  const onEditorLoad = useCallback(
    (_: BlockSuiteDoc, editor: AffineEditorContainer) => {
      setActiveBlocksuiteEditor(editor);
      return noop;
    },
    [setActiveBlocksuiteEditor]
  );

  if (!workspace || !page) {
    return;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <FrameworkScope scope={page.scope}>
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
                  <Scrollable.Viewport
                    className={clsx(
                      'affine-page-viewport',
                      styles.editorContainer
                    )}
                  >
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
          <PeekViewManagerModal />
        </AppContainer>
      </FrameworkScope>
    </FrameworkScope>
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
