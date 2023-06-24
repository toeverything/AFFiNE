import { Content, displayFlex } from '@affine/component';
import { AffineWatermark } from '@affine/component/affine-watermark';
import { appSidebarResizingAtom } from '@affine/component/app-sidebar';
import type { DraggableTitleCellData } from '@affine/component/page-list';
import { StyledTitleLink } from '@affine/component/page-list';
import {
  MainContainer,
  ToolContainer,
  WorkspaceFallback,
} from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { config, DEFAULT_HELLO_WORLD_PAGE_ID, env } from '@affine/env';
import { initEmptyPage, initPageWithPreloading } from '@affine/env/blocksuite';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { setUpLanguage, useI18N } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { createAffineGlobalChannel } from '@affine/workspace/affine/sync';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import type { PassiveDocProvider } from '@blocksuite/store';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
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
import { rootStore } from '@toeverything/plugin-infra/manager';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { FC, PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';
import {
  openQuickSearchModalAtom,
  openSettingModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import { useTrackRouterHistoryEffect } from '../atoms/history';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { AppContainer } from '../components/affine/app-container';
import type { IslandItemNames } from '../components/pure/help-island';
import { HelpIsland } from '../components/pure/help-island';
import {
  DROPPABLE_SIDEBAR_TRASH,
  RootAppSidebar,
} from '../components/root-app-sidebar';
import { useBlockSuiteMetaHelper } from '../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import { useWorkspaces } from '../hooks/use-workspaces';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { pathGenerator, publicPathGenerator } from '../shared';
import { toast } from '../utils';

const QuickSearchModal = lazy(() =>
  import('../components/pure/quick-search-modal').then(module => ({
    default: module.QuickSearchModal,
  }))
);
const SettingModal = lazy(() =>
  import('../components/affine/setting-modal').then(module => ({
    default: module.SettingModal,
  }))
);

export const PublicQuickSearch: FC = () => {
  const publicWorkspace = useAtomValue(publicWorkspaceAtom);
  const router = useRouter();
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );
  return (
    <Suspense>
      <QuickSearchModal
        blockSuiteWorkspace={publicWorkspace.blockSuiteWorkspace}
        open={openQuickSearchModal}
        setOpen={setOpenQuickSearchModalAtom}
        router={router}
      />
    </Suspense>
  );
};

function DefaultProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export const QuickSearch: FC = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const router = useRouter();
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';
  const publicWorkspaceId = useAtomValue(publicWorkspaceIdAtom);
  if (!blockSuiteWorkspace) {
    if (isPublicWorkspace && publicWorkspaceId) {
      return <PublicQuickSearch />;
    }
    return null;
  }
  return (
    <QuickSearchModal
      blockSuiteWorkspace={currentWorkspace?.blockSuiteWorkspace}
      open={openQuickSearchModal}
      setOpen={setOpenQuickSearchModalAtom}
      router={router}
    />
  );
};
export const Setting: FC = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const router = useRouter();
  const [openSettingModal, setOpenSettingModalAtom] =
    useAtom(openSettingModalAtom);
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';
  if (!blockSuiteWorkspace || isPublicWorkspace) {
    return null;
  }
  return (
    <SettingModal
      open={openSettingModal}
      setOpen={setOpenSettingModalAtom}
      router={router}
    />
  );
};

const logger = new DebugLogger('workspace-layout');

const affineGlobalChannel = createAffineGlobalChannel(
  WorkspaceAdapters[WorkspaceFlavour.AFFINE].CRUD
);

export const AllWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactElement => {
  const currentWorkspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
  const workspaces = useWorkspaces();
  useEffect(() => {
    const providers = workspaces
      // ignore current workspace
      .filter(workspace => workspace.id !== currentWorkspaceId)
      .flatMap(workspace =>
        workspace.blockSuiteWorkspace.providers.filter(
          (provider): provider is PassiveDocProvider =>
            'passive' in provider && provider.passive
        )
      );
    providers.forEach(provider => {
      provider.connect();
    });
    return () => {
      providers.forEach(provider => {
        provider.disconnect();
      });
    };
  }, [currentWorkspaceId, workspaces]);
  return <>{children}</>;
};

declare global {
  // eslint-disable-next-line no-var
  var HALTING_PROBLEM_TIMEOUT: number;
}

if (globalThis.HALTING_PROBLEM_TIMEOUT === undefined) {
  globalThis.HALTING_PROBLEM_TIMEOUT = 1000;
}

export const CurrentWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactElement => {
  const workspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const exist = metadata.find(m => m.id === workspaceId);
  const router = useRouter();
  const push = router.push;
  // fixme(himself65): this is not a good way to handle this,
  //  need a better way to check whether this workspace really exist.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!exist) {
        push('/').catch(err => {
          console.error(err);
        });
        globalThis.HALTING_PROBLEM_TIMEOUT <<= 1;
      }
    }, globalThis.HALTING_PROBLEM_TIMEOUT);
    return () => {
      clearTimeout(id);
    };
  }, [push, exist, metadata.length]);
  if (metadata.length === 0) {
    return <WorkspaceFallback key="no-workspace" />;
  }
  if (!router.isReady) {
    return <WorkspaceFallback key="router-is-loading" />;
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
    const i18n = useI18N();
    useEffect(() => {
      document.documentElement.lang = i18n.language;
      // todo(himself65): this is a hack, we should use a better way to set the language
      setUpLanguage(i18n)?.catch(error => {
        console.error(error);
      });
    }, [i18n]);
    useTrackRouterHistoryEffect();
    const currentWorkspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
    const jotaiWorkspaces = useAtomValue(rootWorkspacesMetadataAtom);
    const meta = useMemo(
      () => jotaiWorkspaces.find(x => x.id === currentWorkspaceId),
      [currentWorkspaceId, jotaiWorkspaces]
    );
    const set = useSetAtom(rootWorkspacesMetadataAtom);
    useEffect(() => {
      logger.info('mount');
      const controller = new AbortController();
      const lists = Object.values(WorkspaceAdapters)
        .sort((a, b) => a.loadPriority - b.loadPriority)
        .map(({ CRUD }) => CRUD.list);

      async function fetch() {
        const jotaiWorkspaces = rootStore.get(rootWorkspacesMetadataAtom);
        const items = [];
        for (const list of lists) {
          try {
            const item = await list();
            if (jotaiWorkspaces.length) {
              item.sort((a, b) => {
                return (
                  jotaiWorkspaces.findIndex(x => x.id === a.id) -
                  jotaiWorkspaces.findIndex(x => x.id === b.id)
                );
              });
            }
            items.push(...item.map(x => ({ id: x.id, flavour: x.flavour })));
          } catch (e) {
            logger.error('list data error:', e);
          }
        }
        if (controller.signal.aborted) {
          return;
        }
        set([...items]);
        logger.info('mount first data:', items);
      }

      fetch().catch(e => {
        logger.error('fetch error:', e);
      });
      return () => {
        controller.abort();
        logger.info('unmount');
      };
    }, [set]);

    useEffect(() => {
      const flavour = jotaiWorkspaces.find(
        x => x.id === currentWorkspaceId
      )?.flavour;
      if (flavour === WorkspaceFlavour.AFFINE) {
        affineGlobalChannel.connect();
        return () => {
          affineGlobalChannel.disconnect();
        };
      }
      return;
    }, [currentWorkspaceId, jotaiWorkspaces]);

    const Provider =
      (meta && WorkspaceAdapters[meta.flavour].UI.Provider) ?? DefaultProvider;
    return (
      <>
        {/* load all workspaces is costly, do not block the whole UI */}
        <Suspense fallback={null}>
          <AllWorkspaceContext>
            <AllWorkspaceModals />
            <CurrentWorkspaceContext>
              {/* fixme(himself65): don't re-render whole modals */}
              <CurrentWorkspaceModals key={currentWorkspaceId} />
            </CurrentWorkspaceContext>
          </AllWorkspaceContext>
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
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);

  // fixme(himself65):
  //  we should move the page into jotai atom since it's an async value

  //#region init workspace
  if (currentWorkspace.blockSuiteWorkspace.isEmpty) {
    // this is a new workspace, so we should redirect to the new page
    const pageId = DEFAULT_HELLO_WORLD_PAGE_ID;
    const page = currentWorkspace.blockSuiteWorkspace.createPage({
      id: pageId,
    });
    assertEquals(page.id, pageId);
    if (config.enablePreloading) {
      initPageWithPreloading(page).catch(error => {
        console.error('import error:', error);
      });
    } else {
      initEmptyPage(page).catch(error => {
        console.error('init empty page error', error);
      });
    }
    if (!router.query.pageId) {
      setCurrentPageId(pageId);
      jumpToPage(currentWorkspace.id, pageId).catch(err => {
        console.error(err);
      });
    }
  }
  //#endregion

  useEffect(() => {
    const backgroundProviders =
      currentWorkspace.blockSuiteWorkspace.providers.filter(
        (provider): provider is PassiveDocProvider =>
          'passive' in provider && provider.passive
      );
    backgroundProviders.forEach(provider => {
      provider.connect();
    });
    return () => {
      backgroundProviders.forEach(provider => {
        provider.disconnect();
      });
    };
  }, [currentWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) {
      return;
    }
    const page = currentWorkspace.blockSuiteWorkspace.getPage(
      DEFAULT_HELLO_WORLD_PAGE_ID
    );
    if (page && page.meta.jumpOnce) {
      currentWorkspace.blockSuiteWorkspace.meta.setPageMeta(
        DEFAULT_HELLO_WORLD_PAGE_ID,
        {
          jumpOnce: false,
        }
      );
      setCurrentPageId(currentPageId);
      jumpToPage(currentWorkspace.id, page.id).catch(err => {
        console.error(err);
      });
    }
  }, [
    currentPageId,
    currentWorkspace,
    jumpToPage,
    router.query.pageId,
    setCurrentPageId,
  ]);

  const { openPage } = useRouterHelper(router);
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';
  const title = useRouterTitle(router);
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

  const [, setOpenSettingModalAtom] = useAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom(true);
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

  const showList: IslandItemNames[] = env.isDesktop
    ? ['whatNew', 'contact', 'guide']
    : ['whatNew', 'contact'];

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
    },
    [moveToTrash, t]
  );

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        <AppContainer resizing={resizing}>
          <RootAppSidebar
            isPublicWorkspace={isPublicWorkspace}
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
            currentPath={router.asPath.split('?')[0]}
            paths={isPublicWorkspace ? publicPathGenerator : pathGenerator}
          />
          <MainContainer>
            {children}
            <ToolContainer>
              {/* fixme(himself65): remove this */}
              <div id="toolWrapper" style={{ marginBottom: '12px' }}>
                {/* Slot for block hub */}
              </div>
              {!isPublicWorkspace && (
                <HelpIsland
                  showList={router.query.pageId ? undefined : showList}
                />
              )}
            </ToolContainer>
            <AffineWatermark />
          </MainContainer>
        </AppContainer>
        <PageListTitleCellDragOverlay />
      </DndContext>
      <QuickSearch />
      <Setting />
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
