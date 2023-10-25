import { toast } from '@affine/component';
import {
  currentCollectionAtom,
  FloatingToolbar,
  NewPageButton,
  OperationCell,
  PageList,
  PageListScrollContainer,
  useCollectionManager,
} from '@affine/component/page-list';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { CloseIcon, DeleteIcon, ViewLayersIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useCallback, useMemo, useState } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';
import { NIL } from 'uuid';

import { collectionsCRUDAtom } from '../../atoms/collections';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '../../hooks/affine/use-trash-modal-helper';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
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

const PageListHeader = () => {
  const t = useAFFiNEI18N();
  const [currentWorkspace] = useCurrentWorkspace();
  const setting = useCollectionManager(collectionsCRUDAtom);
  const { importFile, createEdgeless, createPage } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const title = useMemo(() => {
    if (setting.isDefault) {
      return t['com.affine.all-pages.header']();
    }
    return (
      <>
        {t['com.affine.collections.header']()} /
        <div className={styles.titleIcon}>
          <ViewLayersIcon />
        </div>
        <div className={styles.titleCollectionName}>
          {setting.currentCollection.name}
        </div>
      </>
    );
  }, [setting.currentCollection.name, setting.isDefault, t]);

  return (
    <div className={styles.allPagesHeader}>
      <div className={styles.allPagesHeaderTitle}>{title}</div>
      <NewPageButton
        importFile={importFile}
        createNewEdgeless={createEdgeless}
        createNewPage={createPage}
      />
    </div>
  );
};

const usePageOperationsRenderer = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { setTrashModal } = useTrashModalHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const { toggleFavorite } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
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
        <>
          <OperationCell
            favorite={!!page.favorite}
            isPublic={!!page.isPublic}
            onDisablePublicSharing={onDisablePublicSharing}
            link={`/workspace/${currentWorkspace.id}/${page.id}`}
            onRemoveToTrash={() =>
              setTrashModal({
                open: true,
                pageIds: [page.id],
                pageTitles: [page.title],
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

  return pageOperationsRenderer;
};

const PageListFloatingToolbar = ({
  selectedIds,
  pageNames,
  onClose,
}: {
  selectedIds: string[];
  pageNames: string[];
  onClose: () => void;
}) => {
  const open = selectedIds.length > 0;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  const [currentWorkspace] = useCurrentWorkspace();
  const { setTrashModal } = useTrashModalHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const handleMultiDelete = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: selectedIds,
      pageTitles: pageNames,
    });
  }, [selectedIds, pageNames, setTrashModal]);

  return (
    <FloatingToolbar
      className={styles.floatingToolbar}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <FloatingToolbar.Item>
        <Trans
          i18nKey="com.affine.page.toolbar.selected"
          count={selectedIds.length}
        >
          <div className={styles.toolbarSelectedNumber}>
            {{ count: selectedIds.length } as any}
          </div>
          pages selected
        </Trans>
      </FloatingToolbar.Item>
      <FloatingToolbar.Button onClick={onClose} icon={<CloseIcon />} />
      <FloatingToolbar.Separator />
      <FloatingToolbar.Button
        onClick={handleMultiDelete}
        icon={<DeleteIcon />}
        type="danger"
      />
    </FloatingToolbar>
  );
};

// even though it is called all page, it is also being used for collection route as well
export const AllPage = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { isPreferredEdgeless } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const pageOperationsRenderer = usePageOperationsRenderer();
  const filteredPageMetas = useFilteredPageMetas(
    'all',
    pageMetas,
    currentWorkspace.blockSuiteWorkspace
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const deselectAll = useCallback(() => {
    setSelectedPageIds([]);
  }, []);
  const selectedPageNames = useMemo(() => {
    return selectedPageIds.map(id => {
      const page = pageMetas.find(page => page.id === id);
      return page?.title || '';
    });
  }, [pageMetas, selectedPageIds]);
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
        <PageListHeader />
        {filteredPageMetas.length > 0 ? (
          <>
            <PageList
              selectable="toggle"
              selectedPageIds={selectedPageIds}
              onSelectedPageIdsChange={setSelectedPageIds}
              pages={filteredPageMetas}
              clickMode="link"
              isPreferredEdgeless={isPreferredEdgeless}
              blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
              pageOperationsRenderer={pageOperationsRenderer}
            />
            <PageListFloatingToolbar
              selectedIds={selectedPageIds}
              pageNames={selectedPageNames}
              onClose={deselectAll}
            />
          </>
        ) : (
          <EmptyPageList
            type="all"
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          />
        )}
      </PageListScrollContainer>
    </div>
  );
};

export const Component = () => {
  return <AllPage />;
};
