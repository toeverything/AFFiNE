import { toast } from '@affine/component';
import {
  CollectionList,
  currentCollectionAtom,
  FloatingToolbar,
  NewPageButton as PureNewPageButton,
  OperationCell,
  type PageListHandle,
  useCollectionManager,
  VirtualizedPageList,
} from '@affine/component/page-list';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import {
  CloseIcon,
  DeleteIcon,
  PlusIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import clsx from 'clsx';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NIL } from 'uuid';

import { collectionsCRUDAtom } from '../../../atoms/collections';
import { HubIsland } from '../../../components/affine/hub-island';
import { usePageHelper } from '../../../components/blocksuite/block-suite-page-list/utils';
import { Header } from '../../../components/pure/header';
import { WindowsAppControls } from '../../../components/pure/header/windows-app-controls';
import { WorkspaceModeFilterTab } from '../../../components/pure/workspace-mode-filter-tab';
import { useAllPageListConfig } from '../../../hooks/affine/use-all-page-list-config';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useDeleteCollectionInfo } from '../../../hooks/affine/use-delete-collection-info';
import { useTrashModalHelper } from '../../../hooks/affine/use-trash-modal-helper';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { performanceRenderLogger } from '../../../shared';
import { EmptyPageList } from '../page-list-empty';
import { useFilteredPageMetas } from '../pages';
import * as styles from './all-page.css';
import { FilterContainer } from './all-page-filter';

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
      <NewPageButton testId="new-page-button-trigger">
        {t['New Page']()}
      </NewPageButton>
    </div>
  );
};

const usePageOperationsRenderer = () => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
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
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
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
  testId,
}: PropsWithChildren<{
  className?: string;
  size?: 'small' | 'default';
  testId?: string;
}>) => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const { importFile, createEdgeless, createPage } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  return (
    <div className={className} data-testid={testId}>
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

const AllPageHeader = ({
  workspace,
  showCreateNew,
}: {
  workspace: Workspace;
  showCreateNew: boolean;
}) => {
  const setting = useCollectionManager(collectionsCRUDAtom);
  const config = useAllPageListConfig();
  const userInfo = useDeleteCollectionInfo();
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  return (
    <>
      <Header
        left={
          <CollectionList
            userInfo={userInfo}
            allPageListConfig={config}
            setting={setting}
            propertiesMeta={workspace.meta.properties}
          />
        }
        right={
          <div className={styles.headerRightWindows}>
            <NewPageButton
              size="small"
              className={clsx(
                styles.headerCreateNewButton,
                !showCreateNew && styles.headerCreateNewButtonHidden
              )}
            >
              <PlusIcon />
            </NewPageButton>
            {isWindowsDesktop ? <WindowsAppControls /> : null}
          </div>
        }
        center={<WorkspaceModeFilterTab />}
      />
      <FilterContainer />
    </>
  );
};

// even though it is called all page, it is also being used for collection route as well
export const AllPage = () => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
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
      <AllPageHeader
        workspace={currentWorkspace.blockSuiteWorkspace}
        showCreateNew={!hideHeaderCreateNewPage}
      />
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
          heading={<PageListHeader />}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      )}
      <HubIsland />
    </div>
  );
};

export const Component = () => {
  performanceRenderLogger.info('AllPage');

  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const currentCollection = useSetAtom(currentCollectionAtom);
  const navigateHelper = useNavigateHelper();

  useEffect(() => {
    function checkJumpOnce() {
      for (const [pageId] of currentWorkspace.blockSuiteWorkspace.pages) {
        const page = currentWorkspace.blockSuiteWorkspace.getPage(pageId);
        if (page && page.meta.jumpOnce) {
          currentWorkspace.blockSuiteWorkspace.meta.setPageMeta(page.id, {
            jumpOnce: false,
          });
          navigateHelper.jumpToPage(currentWorkspace.id, pageId);
        }
      }
    }
    checkJumpOnce();
    return currentWorkspace.blockSuiteWorkspace.slots.pagesUpdated.on(
      checkJumpOnce
    ).dispose;
  }, [
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    navigateHelper,
  ]);

  useEffect(() => {
    currentCollection(NIL);
  }, [currentCollection]);

  return <AllPage />;
};
