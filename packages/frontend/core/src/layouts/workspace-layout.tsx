import {
  AppSidebarFallback,
  appSidebarResizingAtom,
} from '@affine/component/app-sidebar';
import { RootBlockHub } from '@affine/component/block-hub';
import {
  type DraggableTitleCellData,
  PageListDragOverlay,
} from '@affine/component/page-list';
import {
  MainContainer,
  ToolContainer,
  WorkspaceFallback,
} from '@affine/component/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { loadPage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { PropsWithChildren, ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Map as YMap } from 'yjs';

import { openQuickSearchModalAtom, openSettingModalAtom } from '../atoms';
import { mainContainerAtom } from '../atoms/element';
import { AdapterProviderWrapper } from '../components/adapter-worksapce-wrapper';
import { AppContainer } from '../components/affine/app-container';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import type { IslandItemNames } from '../components/pure/help-island';
import { HelpIsland } from '../components/pure/help-island';
import { processCollectionsDrag } from '../components/pure/workspace-slider-bar/collections';
import {
  DROPPABLE_SIDEBAR_TRASH,
  RootAppSidebar,
} from '../components/root-app-sidebar';
import { WorkspaceUpgrade } from '../components/workspace-upgrade';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { useBlockSuiteMetaHelper } from '../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { pathGenerator } from '../shared';
import { toast } from '../utils';

const CMDKQuickSearchModal = lazy(() =>
  import('../components/pure/cmdk').then(module => ({
    default: module.CMDKQuickSearchModal,
  }))
);

export const QuickSearch = () => {
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );

  const [currentWorkspace] = useCurrentWorkspace();
  const { pageId } = useParams();
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(
    currentWorkspace?.blockSuiteWorkspace
  ).find(meta => meta.id === pageId);

  if (!blockSuiteWorkspace) {
    return null;
  }

  return (
    <CMDKQuickSearchModal
      open={openQuickSearchModal}
      onOpenChange={setOpenQuickSearchModalAtom}
      pageMeta={pageMeta}
    />
  );
};

const showList: IslandItemNames[] = environment.isDesktop
  ? ['whatNew', 'contact', 'guide']
  : ['whatNew', 'contact'];

export const CurrentWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactNode => {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const exist = metadata.find(m => m.id === workspaceId);
  if (metadata.length === 0) {
    return <WorkspaceFallback key="no-workspace" />;
  }
  if (!workspaceId) {
    return <WorkspaceFallback key="finding-workspace-id" />;
  }
  if (!exist) {
    return <WorkspaceFallback key="workspace-not-found" />;
  }
  return children;
};

type WorkspaceLayoutProps = {
  incompatible?: boolean;
};

// fix https://github.com/toeverything/AFFiNE/issues/4825
function useLoadWorkspacePages() {
  const [currentWorkspace] = useCurrentWorkspace();
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);

  useEffect(() => {
    if (currentWorkspace) {
      const timer = setTimeout(() => {
        const pageIds = pageMetas.map(meta => meta.id);
        const pages = pageIds
          .map(id => currentWorkspace.blockSuiteWorkspace.getPage(id))
          .filter((p): p is Page => !!p);
        pages.forEach(page => {
          loadPage(page, -10).catch(e => console.error(e));
        });
      }, 10 * 1000); // load pages after 10s
      return () => {
        clearTimeout(timer);
      };
    }
    return;
  }, [currentWorkspace, pageMetas]);
}

export const WorkspaceLayout = function WorkspacesSuspense({
  children,
  incompatible = false,
}: PropsWithChildren<WorkspaceLayoutProps>) {
  return (
    <AdapterProviderWrapper>
      <CurrentWorkspaceContext>
        {/* load all workspaces is costly, do not block the whole UI */}
        <Suspense>
          <AllWorkspaceModals />
          <CurrentWorkspaceModals />
        </Suspense>
        <Suspense fallback={<WorkspaceFallback />}>
          <WorkspaceLayoutInner incompatible={incompatible}>
            {children}
          </WorkspaceLayoutInner>
        </Suspense>
      </CurrentWorkspaceContext>
    </AdapterProviderWrapper>
  );
};

export const WorkspaceLayoutInner = ({
  children,
  incompatible = false,
}: PropsWithChildren<WorkspaceLayoutProps>) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { openPage } = useNavigateHelper();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const t = useAFFiNEI18N();

  useRegisterWorkspaceCommands();

  useEffect(() => {
    // hotfix for blockVersions
    // this is a mistake in the
    //    0.8.0 ~ 0.8.1
    //    0.8.0-beta.0 ~ 0.8.0-beta.3
    //    0.8.0-canary.17 ~ 0.9.0-canary.3
    const meta = currentWorkspace.blockSuiteWorkspace.doc.getMap('meta');
    const blockVersions = meta.get('blockVersions');
    if (
      !(blockVersions instanceof YMap) &&
      blockVersions != null &&
      typeof blockVersions === 'object'
    ) {
      meta.set(
        'blockVersions',
        new YMap(Object.entries(blockVersions as Record<string, number>))
      );
    }
  }, [currentWorkspace.blockSuiteWorkspace.doc]);

  const handleCreatePage = useCallback(() => {
    return pageHelper.createPage();
  }, [pageHelper]);

  const [, setOpenQuickSearchModalAtom] = useAtom(openQuickSearchModalAtom);
  const handleOpenQuickSearchModal = useCallback(() => {
    setOpenQuickSearchModalAtom(true);
  }, [setOpenQuickSearchModalAtom]);

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom({
      activeTab: 'appearance',
      workspaceId: null,
      open: true,
    });
  }, [setOpenSettingModalAtom]);

  const resizing = useAtomValue(appSidebarResizingAtom);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  const { removeToTrash: moveToTrash } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      // Drag page into trash folder
      if (
        e.over?.id === DROPPABLE_SIDEBAR_TRASH &&
        String(e.active.id).startsWith('page-list-item-')
      ) {
        const { pageId } = e.active.data.current as DraggableTitleCellData;
        // TODO-Doma
        // Co-locate `moveToTrash` with the toast for reuse, as they're always used together
        moveToTrash(pageId);
        toast(t['com.affine.toastMessage.successfullyDeleted']());
      }
      // Drag page into Collections
      processCollectionsDrag(e);
    },
    [moveToTrash, t]
  );

  const { appSettings } = useAppSettingHelper();
  const location = useLocation();
  const { pageId } = useParams();
  const pageMeta = useBlockSuitePageMeta(
    currentWorkspace.blockSuiteWorkspace
  ).find(meta => meta.id === pageId);
  const inTrashPage = pageMeta?.trash ?? false;
  const setMainContainer = useSetAtom(mainContainerAtom);

  useLoadWorkspacePages();

  return (
    <>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        <AppContainer resizing={resizing}>
          <Suspense fallback={<AppSidebarFallback />}>
            <RootAppSidebar
              isPublicWorkspace={false}
              onOpenQuickSearchModal={handleOpenQuickSearchModal}
              onOpenSettingModal={handleOpenSettingModal}
              currentWorkspace={currentWorkspace}
              openPage={useCallback(
                (pageId: string) => {
                  assertExists(currentWorkspace);
                  return openPage(currentWorkspace.id, pageId);
                },
                [currentWorkspace, openPage]
              )}
              createPage={handleCreatePage}
              currentPath={location.pathname.split('?')[0]}
              paths={pathGenerator}
            />
          </Suspense>
          <Suspense fallback={<MainContainer ref={setMainContainer} />}>
            <MainContainer
              ref={setMainContainer}
              padding={appSettings.clientBorder}
              inTrashPage={inTrashPage}
            >
              {incompatible ? <WorkspaceUpgrade /> : children}
              <ToolContainer inTrashPage={inTrashPage}>
                <RootBlockHub />
                <HelpIsland showList={pageId ? undefined : showList} />
              </ToolContainer>
            </MainContainer>
          </Suspense>
        </AppContainer>
        <PageListTitleCellDragOverlay />
      </DndContext>
      <QuickSearch />
    </>
  );
};

function PageListTitleCellDragOverlay() {
  const { active, over } = useDndContext();
  const [content, setContent] = useState<ReactNode>();

  useEffect(() => {
    if (active) {
      const data = active.data.current as DraggableTitleCellData;
      setContent(data.pageTitle);
    }
    // do not update content since it may disappear because of virtual rendering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const renderChildren = useCallback(() => {
    return <PageListDragOverlay over={!!over}>{content}</PageListDragOverlay>;
  }, [content, over]);

  return (
    <DragOverlay dropAnimation={null}>
      {active ? renderChildren() : null}
    </DragOverlay>
  );
}
