import {
  AppSidebarFallback,
  appSidebarResizingAtom,
} from '@affine/component/app-sidebar';
import {
  type DraggableTitleCellData,
  PageListDragOverlay,
} from '@affine/component/page-list';
import { MainContainer, WorkspaceFallback } from '@affine/component/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getBlobEngine } from '@affine/workspace/manager';
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
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';
import type { MigrationPoint } from '@toeverything/infra/blocksuite';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { PropsWithChildren, ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Map as YMap } from 'yjs';

import { openQuickSearchModalAtom, openSettingModalAtom } from '../atoms';
import { AdapterProviderWrapper } from '../components/adapter-worksapce-wrapper';
import { AppContainer } from '../components/affine/app-container';
import { SyncAwareness } from '../components/affine/awareness';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import { RootAppSidebar } from '../components/root-app-sidebar';
import { WorkspaceUpgrade } from '../components/workspace-upgrade';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { useSidebarDrag } from '../hooks/affine/use-sidebar-drag';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
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
  migration?: MigrationPoint;
};

const useSyncWorkspaceBlob = () => {
  // temporary solution for sync blob

  const [currentWorkspace] = useCurrentWorkspace();

  useEffect(() => {
    const blobEngine = getBlobEngine(currentWorkspace.blockSuiteWorkspace);
    let stopped = false;
    function sync() {
      if (stopped) {
        return;
      }

      blobEngine
        ?.sync()
        .catch(error => {
          console.error('sync blob error', error);
        })
        .finally(() => {
          // sync every 1 minute
          setTimeout(sync, 60000);
        });
    }

    // after currentWorkspace changed, wait 1 second to start sync
    setTimeout(sync, 1000);

    return () => {
      stopped = true;
    };
  }, [currentWorkspace]);
};

export const WorkspaceLayout = function WorkspacesSuspense({
  children,
  migration,
}: PropsWithChildren<WorkspaceLayoutProps>) {
  useSyncWorkspaceBlob();
  return (
    <AdapterProviderWrapper>
      <CurrentWorkspaceContext>
        {/* load all workspaces is costly, do not block the whole UI */}
        <Suspense>
          <AllWorkspaceModals />
          <CurrentWorkspaceModals />
        </Suspense>
        <Suspense fallback={<WorkspaceFallback />}>
          <WorkspaceLayoutInner migration={migration}>
            {children}
          </WorkspaceLayoutInner>
        </Suspense>
      </CurrentWorkspaceContext>
    </AdapterProviderWrapper>
  );
};

export const WorkspaceLayoutInner = ({
  children,
  migration,
}: PropsWithChildren<WorkspaceLayoutProps>) => {
  const [currentWorkspace] = useCurrentWorkspace();
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

  const handleDragEnd = useSidebarDrag();

  const { appSettings } = useAppSettingHelper();
  const location = useLocation();

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
          <Suspense fallback={<MainContainer />}>
            <MainContainer padding={appSettings.clientBorder}>
              {migration ? (
                <WorkspaceUpgrade migration={migration} />
              ) : (
                children
              )}
            </MainContainer>
          </Suspense>
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
