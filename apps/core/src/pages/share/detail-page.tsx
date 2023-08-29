import { MainContainer } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { downloadBinaryFromCloud } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { noop } from 'foxact/noop';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect, useLoaderData } from 'react-router-dom';
import { applyUpdate } from 'yjs';

import { PageDetailEditor } from '../../adapters/shared';
import { AppContainer } from '../../components/affine/app-container';

function assertArrayBuffer(value: unknown): asserts value is ArrayBuffer {
  if (!(value instanceof ArrayBuffer)) {
    throw new Error('value is not ArrayBuffer');
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
    const buffer = await downloadBinaryFromCloud(workspaceId, workspaceId);
    assertArrayBuffer(buffer);
    applyUpdate(workspace.doc, new Uint8Array(buffer));
  }
  const page = workspace.getPage(pageId);
  assertExists(page, 'cannot find page');
  // download page
  {
    const buffer = await downloadBinaryFromCloud(
      workspaceId,
      page.spaceDoc.guid
    );
    assertArrayBuffer(buffer);
    applyUpdate(page.spaceDoc, new Uint8Array(buffer));
  }
  logger.info('workspace', workspace);
  workspace.awarenessStore.setReadonly(page, true);
  return page;
};

export const Component = (): ReactElement => {
  const page = useLoaderData() as Page;
  return (
    <AppContainer>
      <MainContainer>
        <PageDetailEditor
          isPublic
          workspace={page.workspace}
          pageId={page.id}
          onInit={useCallback(() => noop, [])}
          onLoad={useCallback(() => noop, [])}
        />
      </MainContainer>
    </AppContainer>
  );
};
