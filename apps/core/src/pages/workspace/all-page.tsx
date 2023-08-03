import { useCollectionManager } from '@affine/component/page-list';
import { DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX } from '@affine/env/constant';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { getActiveBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { currentPageIdAtom, rootStore } from '@toeverything/infra/atom';
import { useAtom } from 'jotai/react';
import { useCallback, useEffect } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';

import { getUIAdapter } from '../../adapters/workspace';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';

export const loader: LoaderFunction = async args => {
  const workspaceId = args.params.workspaceId;
  assertExists(workspaceId);
  const workspaceAtom = getActiveBlockSuiteWorkspaceAtom(workspaceId);
  const workspace = await rootStore.get(workspaceAtom);
  const page = workspace.getPage(
    `${workspace.id}-${DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX}`
  );
  if (page && page.meta.jumpOnce) {
    workspace.meta.setPageMeta(page.id, {
      jumpOnce: false,
    });
    return redirect(`/workspace/${workspace.id}/${page.id}`);
  }
  return null;
};

export const AllPage = () => {
  const { jumpToPage } = useNavigateHelper();
  const [currentPageId, setCurrentPageId] = useAtom(currentPageIdAtom);
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
  useEffect(() => {
    const page = currentWorkspace.blockSuiteWorkspace.getPage(
      `${currentWorkspace.blockSuiteWorkspace.id}-${DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX}`
    );
    if (page && page.meta.jumpOnce) {
      currentWorkspace.blockSuiteWorkspace.meta.setPageMeta(page.id, {
        jumpOnce: false,
      });
      setCurrentPageId(currentPageId);
      jumpToPage(currentWorkspace.id, page.id);
    }
  }, [currentPageId, currentWorkspace, jumpToPage, setCurrentPageId]);
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
