import {
  AppSidebarFallback,
  appSidebarResizingAtom,
} from '@affine/component/app-sidebar';
import { MainContainer, WorkspaceFallback } from '@affine/component/workspace';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useWorkspaceStatus } from '@affine/core/hooks/use-workspace-status';
import { assertExists } from '@blocksuite/global/utils';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { PropsWithChildren, ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Map as YMap } from 'yjs';

import { openQuickSearchModalAtom, openSettingModalAtom } from '../atoms';
import { AppContainer } from '../components/affine/app-container';
import { SyncAwareness } from '../components/affine/awareness';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import {
  type DraggableTitleCellData,
  PageListDragOverlay,
} from '../components/page-list';
import { RootAppSidebar } from '../components/root-app-sidebar';
import { WorkspaceUpgrade } from '../components/workspace-upgrade';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { useSidebarDrag } from '../hooks/affine/use-sidebar-drag';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { SWRConfigProvider } from '../providers/swr-config-provider';
import { pathGenerator } from '../shared';

const CMDKQuickSearchModal = lazy(() =>
  import('../components/pure/cmdk').then(module => ({
    default: module.CMDKQuickSearchModal,
  }))
);

export const QuickSearch = () => {
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );

  const currentWorkspace = useService(Workspace);
  const { pageId } = useParams();
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(
    currentWorkspace.blockSuiteWorkspace
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

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  return (
    <SWRConfigProvider>
      {/* load all workspaces is costly, do not block the whole UI */}
      <Suspense>
        <AllWorkspaceModals />
        <CurrentWorkspaceModals />
      </Suspense>
      <Suspense fallback={<WorkspaceFallback />}>
        <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      </Suspense>
    </SWRConfigProvider>
  );
};

export const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  const currentWorkspace = useService(Workspace);
  const { openPage } = useNavigateHelper();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);

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
      blockVersions !== null &&
      blockVersions !== undefined &&
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

  const handleDragEnd = useSidebarDrag();

  const { appSettings } = useAppSettingHelper();
  const location = useLocation();
  const { pageId } = useParams();

  // todo: refactor this that the root layout do not need to check route state
  const isInPageDetail = !!pageId;

  const upgradeStatus = useWorkspaceStatus(currentWorkspace, s => s.upgrade);

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
          <MainContainer
            transparent={isInPageDetail}
            padding={appSettings.clientBorder}
          >
            <Suspense>
              {upgradeStatus?.needUpgrade || upgradeStatus?.upgrading ? (
                <WorkspaceUpgrade />
              ) : (
                children
              )}
            </Suspense>
          </MainContainer>
        </AppContainer>
        <PageListTitleCellDragOverlay />
      </DndContext>
      <QuickSearch />
      <SyncAwareness />
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
