import { MainContainer } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { downloadBinaryFromCloud } from '@affine/workspace/providers';
import type { CloudDoc } from '@affine/workspace/providers/cloud';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { noop } from 'foxact/noop';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import {
  isRouteErrorResponse,
  redirect,
  useLoaderData,
  useRouteError,
} from 'react-router-dom';
import { applyUpdate } from 'yjs';

import { PageDetailEditor } from '../../adapters/shared';
import type { PageMode } from '../../atoms';
import { AppContainer } from '../../components/affine/app-container';
import { ShareHeader } from '../../components/share-header';
import { SharePageNotFoundError } from '../../components/share-page-not-found-error';

type LoaderData = {
  page: Page;
  publishMode: PageMode;
};

function assertDownloadResponse(
  value: CloudDoc | boolean
): asserts value is CloudDoc {
  if (
    !value ||
    !((value as CloudDoc).arrayBuffer instanceof ArrayBuffer) ||
    typeof (value as CloudDoc).publishMode !== 'string'
  ) {
    throw new Error('value is not a valid download response');
  }
}

const logger = new DebugLogger('public:share-page');

export const loader: LoaderFunction = async ({ params }) => {
  const workspaceId = params?.workspaceId;
  const pageId = params?.pageId;
  if (!workspaceId || !pageId) {
    return redirect('/404');
  }
  const workspace = getOrCreateWorkspace(
    workspaceId,
    WorkspaceFlavour.AFFINE_PUBLIC
  );
  // download root workspace
  {
    const response = await downloadBinaryFromCloud(workspaceId, workspaceId);
    assertDownloadResponse(response);
    const { arrayBuffer } = response;
    applyUpdate(workspace.doc, new Uint8Array(arrayBuffer));
  }
  const page = workspace.getPage(pageId);
  assertExists(page, 'cannot find page');
  // download page

  const response = await downloadBinaryFromCloud(
    workspaceId,
    page.spaceDoc.guid
  );
  assertDownloadResponse(response);
  const { arrayBuffer, publishMode } = response;

  applyUpdate(page.spaceDoc, new Uint8Array(arrayBuffer));

  logger.info('workspace', workspace);
  workspace.awarenessStore.setReadonly(page, true);
  return { page, publishMode };
};

export const Component = (): ReactElement => {
  const { page, publishMode } = useLoaderData() as LoaderData;
  return (
    <AppContainer>
      <MainContainer>
        <ShareHeader
          workspace={page.workspace}
          pageId={page.id}
          publishMode={publishMode}
        />
        <PageDetailEditor
          isPublic
          publishMode={publishMode}
          workspace={page.workspace}
          pageId={page.id}
          onLoad={useCallback(() => noop, [])}
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
