import { DebugLogger } from '@affine/debug';
import { DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX } from '@affine/env/constant';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getWorkspace } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { lazy } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';

const AllWorkspaceModals = lazy(() =>
  import('../providers/modal-provider').then(({ AllWorkspaceModals }) => ({
    default: AllWorkspaceModals,
  }))
);

const logger = new DebugLogger('index-page');

export const loader: LoaderFunction = async () => {
  const rootStore = getCurrentStore();
  const meta = await rootStore.get(rootWorkspacesMetadataAtom);
  const lastId = localStorage.getItem('last_workspace_id');
  const lastPageId = localStorage.getItem('last_page_id');
  const target = (lastId && meta.find(({ id }) => id === lastId)) || meta.at(0);
  if (target) {
    const targetWorkspace = getWorkspace(target.id);
    const nonTrashPages = targetWorkspace.meta.pageMetas.filter(
      ({ trash }) => !trash
    );
    const helloWorldPage = nonTrashPages.find(
      ({ id, jumpOnce }) =>
        id.endsWith(DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX) && jumpOnce
    )?.id;
    const pageId =
      nonTrashPages.find(({ id }) => id === lastPageId)?.id ??
      nonTrashPages.at(0)?.id;
    if (helloWorldPage) {
      logger.debug(
        'Found target workspace. Jump to hello world page',
        helloWorldPage
      );
      return redirect(`/workspace/${targetWorkspace.id}/${helloWorldPage}`);
    } else if (pageId) {
      logger.debug('Found target workspace. Jump to page', pageId);
      return redirect(`/workspace/${targetWorkspace.id}/${pageId}`);
    } else {
      logger.debug('Found target workspace. Jump to all page');
      return redirect(`/workspace/${targetWorkspace.id}/all`);
    }
  }
  return null;
};

export const Component = () => {
  return (
    <>
      <AllWorkspaceModals />
    </>
  );
};
