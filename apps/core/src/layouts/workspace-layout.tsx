import { Content, displayFlex } from '@affine/component';
import { AffineWatermark } from '@affine/component/affine-watermark';
import { appSidebarResizingAtom } from '@affine/component/app-sidebar';
import { BlockHubWrapper } from '@affine/component/block-hub';
import { NotificationCenter } from '@affine/component/notification-center';
import type { DraggableTitleCellData } from '@affine/component/page-list';
import { StyledTitleLink } from '@affine/component/page-list';
import {
  MainContainer,
  ToolContainer,
  WorkspaceFallback,
} from '@affine/component/workspace';
import { DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  rootBlockHubAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { nanoid } from '@blocksuite/store';
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
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { usePassiveWorkspaceEffect } from '@toeverything/plugin-infra/__internal__/react';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/plugin-infra/manager';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { FC, PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { WorkspaceAdapters } from '../adapters/workspace';
import {
  openQuickSearchModalAtom,
  openSettingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useAppSetting } from '../atoms/settings';
import { AppContainer } from '../components/affine/app-container';
import type { IslandItemNames } from '../components/pure/help-island';
import { HelpIsland } from '../components/pure/help-island';
import { processCollectionsDrag } from '../components/pure/workspace-slider-bar/collections';
import {
  DROPPABLE_SIDEBAR_TRASH,
  RootAppSidebar,
} from '../components/root-app-sidebar';
import { useBlockSuiteMetaHelper } from '../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { pathGenerator } from '../shared';
import { toast } from '../utils';

const QuickSearchModal = lazy(() =>
  import('../components/pure/quick-search-modal').then(module => ({
    default: module.QuickSearchModal,
  }))
);

function DefaultProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export const QuickSearch: FC = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  if (!blockSuiteWorkspace) {
    return null;
  }
  return (
    <QuickSearchModal
      workspace={currentWorkspace}
      open={openQuickSearchModal}
      setOpen={setOpenQuickSearchModalAtom}
    />
  );
};

declare global {
  // eslint-disable-next-line no-var
  var HALTING_PROBLEM_TIMEOUT: number;
}

if (globalThis.HALTING_PROBLEM_TIMEOUT === undefined) {
  globalThis.HALTING_PROBLEM_TIMEOUT = 1000;
}

const showList: IslandItemNames[] = environment.isDesktop
  ? ['whatNew', 'contact', 'guide']
  : ['whatNew', 'contact'];

export const CurrentWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactElement => {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const exist = metadata.find(m => m.id === workspaceId);
  const navigate = useNavigate();
  // fixme(himself65): this is not a good way to handle this,
  //  need a better way to check whether this workspace really exist.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!exist) {
        navigate('/');
        globalThis.HALTING_PROBLEM_TIMEOUT <<= 1;
      }
    }, globalThis.HALTING_PROBLEM_TIMEOUT);
    return () => {
      clearTimeout(id);
    };
  }, [exist, metadata.length, navigate]);
  if (metadata.length === 0) {
    return <WorkspaceFallback key="no-workspace" />;
  }
  if (!workspaceId) {
    return <WorkspaceFallback key="finding-workspace-id" />;
  }
  if (!exist) {
    return <WorkspaceFallback key="workspace-not-found" />;
  }
  return <>{children}</>;
};

export const WorkspaceLayout: FC<PropsWithChildren> =
  function WorkspacesSuspense({ children }) {
    const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
    const jotaiWorkspaces = useAtomValue(rootWorkspacesMetadataAtom);
    const meta = useMemo(
      () => jotaiWorkspaces.find(x => x.id === currentWorkspaceId),
      [currentWorkspaceId, jotaiWorkspaces]
    );

    const Provider =
      (meta && WorkspaceAdapters[meta.flavour].UI.Provider) ?? DefaultProvider;
    return (
      <>
        {/* load all workspaces is costly, do not block the whole UI */}
        <Suspense fallback={null}>
          <AllWorkspaceModals />
          <CurrentWorkspaceContext>
            {/* fixme(himself65): don't re-render whole modals */}
            <CurrentWorkspaceModals key={currentWorkspaceId} />
          </CurrentWorkspaceContext>
        </Suspense>
        <CurrentWorkspaceContext>
          <Suspense fallback={<WorkspaceFallback />}>
            <Provider>
              <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
            </Provider>
          </Suspense>
        </CurrentWorkspaceContext>
      </>
    );
  };

export const WorkspaceLayoutInner: FC<PropsWithChildren> = ({ children }) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useAtom(currentPageIdAtom);
  const { jumpToPage, openPage } = useNavigateHelper();

  usePassiveWorkspaceEffect(currentWorkspace.blockSuiteWorkspace);

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

  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const handleCreatePage = useCallback(() => {
    return helper.createPage(nanoid());
  }, [helper]);
  const handleOpenWorkspaceListModal = useCallback(() => {
    setOpenWorkspacesModal(true);
  }, [setOpenWorkspacesModal]);

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
    // Delay 10ms after mousedown
    // Otherwise clicks would be intercepted
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 10,
      },
    })
  );

  const { removeToTrash: moveToTrash } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const t = useAFFiNEI18N();

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
        toast(t['Successfully deleted']());
      }
      // Drag page into Collections
      processCollectionsDrag(e);
    },
    [moveToTrash, t]
  );

  const [appSetting] = useAppSetting();
  const location = useLocation();
  const { pageId } = useParams();

  return (
    <>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        <AppContainer resizing={resizing}>
          <RootAppSidebar
            isPublicWorkspace={false}
            onOpenQuickSearchModal={handleOpenQuickSearchModal}
            onOpenSettingModal={handleOpenSettingModal}
            currentWorkspace={currentWorkspace}
            onOpenWorkspaceListModal={handleOpenWorkspaceListModal}
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
          <MainContainer padding={appSetting.clientBorder}>
            {children}
            <ToolContainer>
              <BlockHubWrapper blockHubAtom={rootBlockHubAtom} />
              <HelpIsland showList={pageId ? undefined : showList} />
            </ToolContainer>
            <AffineWatermark />
          </MainContainer>
        </AppContainer>
        <PageListTitleCellDragOverlay />
      </DndContext>
      <QuickSearch />
      {runtimeConfig.enableNotificationCenter && <NotificationCenter />}
    </>
  );
};

function PageListTitleCellDragOverlay() {
  const { active } = useDndContext();

  const renderChildren = useCallback(
    ({ icon, pageTitle }: DraggableTitleCellData) => {
      return (
        <StyledTitleLink>
          {icon}
          <Content ellipsis={true} color="inherit">
            {pageTitle}
          </Content>
        </StyledTitleLink>
      );
    },
    []
  );

  return (
    <DragOverlay
      style={{
        zIndex: 1001,
        backgroundColor: 'var(--affine-black-10)',
        padding: '0 30px',
        cursor: 'default',
        borderRadius: 10,
        ...displayFlex('flex-start', 'center'),
      }}
      dropAnimation={null}
    >
      {active
        ? renderChildren(active.data.current as DraggableTitleCellData)
        : null}
    </DragOverlay>
  );
}
