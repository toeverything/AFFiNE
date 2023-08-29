import { useCollectionManager } from '@affine/component/page-list';
import { DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX } from '@affine/env/constant';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { getActiveBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';

import { getUIAdapter } from '../../adapters/workspace';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  const workspaceId = args.params.workspaceId;
  assertExists(workspaceId);
  const workspaceAtom = getActiveBlockSuiteWorkspaceAtom(workspaceId);
  const workspace = await rootStore.get(workspaceAtom);
  for (const pageId of workspace.pages.keys()) {
    if (pageId.endsWith(DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX)) {
      const page = workspace.getPage(pageId);
      if (page && page.meta.jumpOnce) {
        workspace.meta.setPageMeta(page.id, {
          jumpOnce: false,
        });
        return redirect(`/workspace/${workspace.id}/${page.id}`);
      }
    }
  }
  return null;
};

export const AllPage = () => {
  const { jumpToPage } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const setting = useCollectionManager(currentWorkspace.id);
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId);
      }
    },
    [currentWorkspace, jumpToPage]
  );
  const { PageList, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.ALL,
        }}
      />
      <PageList
        collection={setting.currentCollection}
        onOpenPage={onClickPage}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
      />
    </>
  );
};

export const Component = () => {
  return <AllPage />;
};
