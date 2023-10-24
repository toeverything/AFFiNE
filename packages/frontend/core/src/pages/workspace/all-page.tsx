import { toast } from '@affine/component';
import {
  CollectionBar,
  currentCollectionAtom,
  NewPageButton,
  OperationCell,
  PageList,
  PageListScrollContainer,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';
import { NIL } from 'uuid';

import { collectionsCRUDAtom } from '../../atoms/collections';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useAllPageListConfig } from '../../hooks/affine/use-all-page-list-config';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '../../hooks/affine/use-trash-modal-helper';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useGetPageInfoById } from '../../hooks/use-get-page-info';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import * as styles from './all-page.css';
import { EmptyPageList } from './page-list-empty';
import { useFilteredPageMetas } from './pages';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  const workspaceId = args.params.workspaceId;
  assertExists(workspaceId);
  const [workspaceAtom] = getBlockSuiteWorkspaceAtom(workspaceId);
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
  rootStore.set(currentCollectionAtom, NIL);
  return null;
};

export const AllPage = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { isPreferredEdgeless, importFile, createEdgeless, createPage } =
    usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const { toggleFavorite } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const { setTrashModal } = useTrashModalHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const navigateHelper = useNavigateHelper();
  const backToAll = useCallback(() => {
    navigateHelper.jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
  }, [navigateHelper, currentWorkspace.id]);

  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const t = useAFFiNEI18N();

  const pageOperationsRenderer = useCallback(
    (page: PageMeta) => {
      const onDisablePublicSharing = () => {
        toast('Successfully disabled', {
          portal: document.body,
        });
      };
      return (
        <>
          <OperationCell
            favorite={!!page.favorite}
            isPublic={!!page.isPublic}
            onDisablePublicSharing={onDisablePublicSharing}
            link={`/workspace/${currentWorkspace.id}/${page.id}`}
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
        </>
      );
    },
    [currentWorkspace.id, setTrashModal, t, toggleFavorite]
  );

  const getPageInfo = useGetPageInfoById(currentWorkspace.blockSuiteWorkspace);

  const filteredPageMetas = useFilteredPageMetas(
    'all',
    pageMetas,
    currentWorkspace.blockSuiteWorkspace
  );
  const config = useAllPageListConfig();
  const setting = useCollectionManager(collectionsCRUDAtom);
  return (
    <div className={styles.root}>
      {currentWorkspace.flavour !== WorkspaceFlavour.AFFINE_PUBLIC ? (
        <WorkspaceHeader
          currentWorkspaceId={currentWorkspace.id}
          currentEntry={{
            subPath: WorkspaceSubPath.ALL,
          }}
        />
      ) : null}
      <PageListScrollContainer className={styles.scrollContainer}>
        <div className={styles.allPagesHeader}>
          <div className={styles.allPagesHeaderTitle}>
            {setting.isDefault
              ? t['com.affine.all-pages.header']()
              : t['com.affine.collections.header']()}
            <CollectionBar
              allPageListConfig={config}
              backToAll={backToAll}
              getPageInfo={getPageInfo}
              collectionsAtom={collectionsCRUDAtom}
              // the following props is not reactive right?
              propertiesMeta={
                currentWorkspace.blockSuiteWorkspace.meta.properties
              }
            />
          </div>
          <NewPageButton
            importFile={importFile}
            createNewEdgeless={createEdgeless}
            createNewPage={createPage}
          />
        </div>
        <PageList
          selectable="toggle"
          pages={filteredPageMetas}
          renderPageAsLink
          fallback={
            <EmptyPageList
              type="all"
              blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
            />
          }
          isPreferredEdgeless={isPreferredEdgeless}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          pageOperationsRenderer={pageOperationsRenderer}
        />
      </PageListScrollContainer>
    </div>
  );
};

export const Component = () => {
  return <AllPage />;
};
