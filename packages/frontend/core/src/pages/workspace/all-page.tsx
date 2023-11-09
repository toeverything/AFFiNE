import { toast } from '@affine/component';
import {
  currentCollectionAtom,
  FloatingToolbar,
  NewPageButton as PureNewPageButton,
  OperationCell,
  type PageListHandle,
  useCollectionManager,
  VirtualizedPageList,
} from '@affine/component/page-list';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  CloseIcon,
  DeleteIcon,
  PlusIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import clsx from 'clsx';
import {
  type PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect } from 'react-router-dom';
import { NIL } from 'uuid';

import { collectionsCRUDAtom } from '../../atoms/collections';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { useTrashModalHelper } from '../../hooks/affine/use-trash-modal-helper';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { performanceRenderLogger } from '../../shared';
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
  const setting = useCollectionManager(collectionsCRUDAtom);
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
      <NewPageButton>{t['New Page']()}</NewPageButton>
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
      );
    },
    [currentWorkspace.id, setTrashModal, t, toggleFavorite]
  );

  return pageOperationsRenderer;
};

const PageListFloatingToolbar = ({
  selectedIds,
  onClose,
  open,
}: {
  open: boolean;
  selectedIds: string[];
  onClose: () => void;
}) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { setTrashModal } = useTrashModalHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const handleMultiDelete = useCallback(() => {
    const pageNameMapping = Object.fromEntries(
      pageMetas.map(meta => [meta.id, meta.title])
    );

    const pageNames = selectedIds.map(id => pageNameMapping[id] ?? '');
    setTrashModal({
      open: true,
      pageIds: selectedIds,
      pageTitles: pageNames,
    });
  }, [pageMetas, selectedIds, setTrashModal]);

  return (
    <FloatingToolbar className={styles.floatingToolbar} open={open}>
      <FloatingToolbar.Item>
        <Trans
          i18nKey="com.affine.page.toolbar.selected"
          count={selectedIds.length}
        >
          <div className={styles.toolbarSelectedNumber}>
            {{ count: selectedIds.length } as any}
          </div>
          selected
        </Trans>
      </FloatingToolbar.Item>
      <FloatingToolbar.Button onClick={onClose} icon={<CloseIcon />} />
      <FloatingToolbar.Separator />
      <FloatingToolbar.Button
        onClick={handleMultiDelete}
        icon={<DeleteIcon />}
        type="danger"
        data-testid="page-list-toolbar-delete"
      />
    </FloatingToolbar>
  );
};

const NewPageButton = ({
  className,
  children,
  size,
}: PropsWithChildren<{
  className?: string;
  size?: 'small' | 'default';
}>) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { importFile, createEdgeless, createPage } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  return (
    <div className={className}>
      <PureNewPageButton
        size={size}
        importFile={importFile}
        createNewEdgeless={createEdgeless}
        createNewPage={createPage}
      >
        <div className={styles.newPageButtonLabel}>{children}</div>
      </PureNewPageButton>
    </div>
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
  const pageListRef = useRef<PageListHandle>(null);

  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);

  const hideFloatingToolbar = useCallback(() => {
    pageListRef.current?.toggleSelectable();
  }, []);

  // make sure selected id is in the filtered list
  const filteredSelectedPageIds = useMemo(() => {
    const ids = filteredPageMetas.map(page => page.id);
    return selectedPageIds.filter(id => ids.includes(id));
  }, [filteredPageMetas, selectedPageIds]);

  const [hideHeaderCreateNewPage, setHideHeaderCreateNewPage] = useState(true);

  return (
    <div className={styles.root}>
      {currentWorkspace.flavour !== WorkspaceFlavour.AFFINE_PUBLIC ? (
        <WorkspaceHeader
          currentWorkspaceId={currentWorkspace.id}
          currentEntry={{
            subPath: WorkspaceSubPath.ALL,
          }}
          rightSlot={
            <NewPageButton
              size="small"
              className={clsx(
                styles.headerCreateNewButton,
                hideHeaderCreateNewPage && styles.headerCreateNewButtonHidden
              )}
            >
              <PlusIcon />
            </NewPageButton>
          }
        />
      ) : null}
      {filteredPageMetas.length > 0 ? (
        <>
          <VirtualizedPageList
            ref={pageListRef}
            selectable="toggle"
            draggable
            atTopThreshold={80}
            atTopStateChange={setHideHeaderCreateNewPage}
            onSelectionActiveChange={setShowFloatingToolbar}
            heading={<PageListHeader />}
            selectedPageIds={filteredSelectedPageIds}
            onSelectedPageIdsChange={setSelectedPageIds}
            pages={filteredPageMetas}
            rowAsLink
            isPreferredEdgeless={isPreferredEdgeless}
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
            pageOperationsRenderer={pageOperationsRenderer}
          />
          <PageListFloatingToolbar
            open={showFloatingToolbar && filteredSelectedPageIds.length > 0}
            selectedIds={filteredSelectedPageIds}
            onClose={hideFloatingToolbar}
          />
        </>
      ) : (
        <EmptyPageList
          type="all"
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      )}
    </div>
  );
};

export const Component = () => {
  performanceRenderLogger.info('AllPage');

  return <AllPage />;
};
