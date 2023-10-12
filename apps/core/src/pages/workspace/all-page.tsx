import { toast } from '@affine/component';
import {
  CollectionBar,
  OperationCell,
  useCollectionManager,
} from '@affine/component/page-list';
import { PageList } from '@affine/component/page-list-table';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { getActiveBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';

import { getUIAdapter } from '../../adapters/workspace';
import { allPageModeSelectAtom } from '../../atoms';
import { collectionsCRUDAtom } from '../../atoms/collections';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '../../hooks/affine/use-trash-modal-helper';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useGetPageInfoById } from '../../hooks/use-get-page-info';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { filterPage } from '../../utils/filter';
import * as styles from './all-page.css';
import { PageListEmpty } from './page-list-empty';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  const workspaceId = args.params.workspaceId;
  assertExists(workspaceId);
  const workspaceAtom = getActiveBlockSuiteWorkspaceAtom(workspaceId);
  const workspace = await rootStore.get(workspaceAtom);
  for (const pageId of workspace.pages.keys()) {
    const page = workspace.getPage(pageId);
    if (page && page.meta.jumpOnce) {
      workspace.meta.setPageMeta(page.id, {
        jumpOnce: false,
      });
      return redirect(`/workspace/${workspace.id}/${page.id}`);
    }
  }
  return null;
};

export const AllPage = () => {
  const { jumpToPage } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const { currentCollection } = useCollectionManager(collectionsCRUDAtom);
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
  const { Header } = getUIAdapter(currentWorkspace.flavour);
  const { isPreferredEdgeless } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const { toggleFavorite } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const { setTrashModal } = useTrashModalHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);

  const onToggleFavorite = useCallback(
    (pageId: string) => {
      toggleFavorite(pageId);
    },
    [toggleFavorite]
  );

  const t = useAFFiNEI18N();

  const pageOperationsRenderer = useCallback(
    (page: PageMeta) => {
      const onDisablePublicSharing = () => {
        toast('Successfully disabled', {
          portal: document.body,
        });
      };
      return (
        <OperationCell
          favorite={!!page.favorite}
          isPublic={!!page.isPublic}
          onDisablePublicSharing={onDisablePublicSharing}
          onOpenPageInNewTab={() => onClickPage(page.id, true)}
          onRemoveToTrash={() =>
            setTrashModal({
              open: true,
              pageId: page.id,
              pageTitle: page.title,
            })
          }
          onToggleFavoritePage={() => {
            const status = page.favorite;
            toggleFavorite(page.id);
            toast(
              status
                ? t['com.affine.toastMessage.removedFavorites']()
                : t['com.affine.toastMessage.addedFavorites']()
            );
          }}
        />
      );
    },
    [onClickPage, setTrashModal, t, toggleFavorite]
  );

  const getPageInfo = useGetPageInfoById(currentWorkspace.blockSuiteWorkspace);

  const [filterMode] = useAtom(allPageModeSelectAtom);

  const filteredPageMetas = useMemo(
    () =>
      pageMetas
        .filter(pageMeta => {
          if (filterMode === 'all') {
            return true;
          }
          if (filterMode === 'edgeless') {
            return isPreferredEdgeless(pageMeta.id);
          }
          if (filterMode === 'page') {
            return !isPreferredEdgeless(pageMeta.id);
          }
          console.error('unknown filter mode', pageMeta, filterMode);
          return true;
        })
        .filter(pageMeta => {
          if (pageMeta.trash) {
            return false;
          }
          if (!currentCollection) {
            return true;
          }
          return filterPage(currentCollection, pageMeta);
        }),
    [pageMetas, filterMode, isPreferredEdgeless, currentCollection]
  );

  return (
    <div className={styles.root}>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.ALL,
        }}
      />
      <CollectionBar
        getPageInfo={getPageInfo}
        collectionsAtom={collectionsCRUDAtom}
        columnsCount={5}
        // the following props is not reactive right?
        propertiesMeta={currentWorkspace.blockSuiteWorkspace.meta.properties}
      />
      <PageList
        pages={filteredPageMetas}
        renderPageAsLink
        fallback={
          <PageListEmpty
            type="all"
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          />
        }
        isPreferredEdgeless={isPreferredEdgeless}
        onToggleFavorite={onToggleFavorite}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        pageOperationsRenderer={pageOperationsRenderer}
      />
    </div>
  );
};

export const Component = () => {
  return <AllPage />;
};
