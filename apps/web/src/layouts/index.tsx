import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import { setUpLanguage, useTranslation } from '@affine/i18n';
import { createAffineGlobalChannel } from '@affine/workspace/affine/sync';
import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists, nanoid } from '@blocksuite/store';
import { NoSsr } from '@mui/material';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { FC, PropsWithChildren } from 'react';
import { Suspense, useCallback, useEffect } from 'react';

import {
  currentWorkspaceIdAtom,
  openQuickSearchModalAtom,
  openWorkspacesModalAtom,
} from '../atoms';
import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { HelpIsland } from '../components/pure/help-island';
import { PageLoading } from '../components/pure/loading';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPageId } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../hooks/use-blocksuite-workspace-helper';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import {
  useSidebarFloating,
  useSidebarResizing,
  useSidebarStatus,
  useSidebarWidth,
} from '../hooks/use-sidebar-status';
import { useWorkspaces } from '../hooks/use-workspaces';
import { WorkspacePlugins } from '../plugins';
import { ModalProvider } from '../providers/ModalProvider';
import type { AllWorkspace } from '../shared';
import { pathGenerator, publicPathGenerator } from '../shared';
import {
  MainContainer,
  MainContainerWrapper,
  StyledPage,
  StyledSliderResizer,
  StyledSliderResizerInner,
  StyledSpacer,
  StyledToolWrapper,
} from './styles';

declare global {
  // eslint-disable-next-line no-var
  var currentWorkspace: AllWorkspace;
}

const QuickSearchModal = dynamic(
  () => import('../components/pure/quick-search-modal')
);

export const PublicQuickSearch: FC = () => {
  const blockSuiteWorkspace = useAtomValue(publicBlockSuiteAtom);
  const router = useRouter();
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );
  return (
    <QuickSearchModal
      blockSuiteWorkspace={blockSuiteWorkspace}
      open={openQuickSearchModal}
      setOpen={setOpenQuickSearchModalAtom}
      router={router}
    />
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

const logger = new DebugLogger('workspace-layout');

const affineGlobalChannel = createAffineGlobalChannel(
  WorkspacePlugins[WorkspaceFlavour.AFFINE].CRUD
);
export const WorkspaceLayout: FC<PropsWithChildren> =
  function WorkspacesSuspense({ children }) {
    const { i18n } = useTranslation();
    useEffect(() => {
      document.documentElement.lang = i18n.language;
      // todo(himself65): this is a hack, we should use a better way to set the language
      setUpLanguage(i18n);
    }, [i18n]);
    useCreateFirstWorkspace();
    const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
    const jotaiWorkspaces = useAtomValue(jotaiWorkspacesAtom);
    const set = useSetAtom(jotaiWorkspacesAtom);
    useEffect(() => {
      logger.info('mount');
      const controller = new AbortController();
      const lists = Object.values(WorkspacePlugins)
        .sort((a, b) => a.loadPriority - b.loadPriority)
        .map(({ CRUD }) => CRUD.list);

      async function fetch() {
        const jotaiWorkspaces = jotaiStore.get(jotaiWorkspacesAtom);
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

      fetch();
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
    }, [currentWorkspaceId, jotaiWorkspaces]);
    return (
      <NoSsr>
        {/* fixme(himself65): don't re-render whole modals */}
        <ModalProvider key={currentWorkspaceId} />
        <Suspense fallback={<PageLoading />}>
          <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
        </Suspense>
      </NoSsr>
    );
  };

export const WorkspaceLayoutInner: FC<PropsWithChildren> = ({ children }) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId] = useCurrentPageId();
  const workspaces = useWorkspaces();

  useEffect(() => {
    logger.info('workspaces: ', workspaces);
  }, [workspaces]);

  useEffect(() => {
    if (currentWorkspace) {
      globalThis.currentWorkspace = currentWorkspace;
    }
  }, [currentWorkspace]);

  useEffect(() => {
    const providers = workspaces.flatMap(workspace =>
      workspace.providers.filter(provider => provider.background)
    );
    providers.forEach(provider => {
      provider.connect();
    });
    return () => {
      providers.forEach(provider => {
        provider.disconnect();
      });
    };
  }, [workspaces]);
  useEffect(() => {
    if (currentWorkspace) {
      currentWorkspace.providers.forEach(provider => {
        if (provider.background) {
          return;
        }
        provider.connect();
      });
      return () => {
        currentWorkspace.providers.forEach(provider => {
          if (provider.background) {
            return;
          }
          provider.disconnect();
        });
      };
    }
  }, [currentWorkspace]);
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace?.blockSuiteWorkspace ?? null
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
  const [resizingSidebar, setIsResizing] = useSidebarResizing();
  const [sidebarOpen, setSidebarOpen] = useSidebarStatus();
  const sidebarFloating = useSidebarFloating();
  const [sidebarWidth, setSliderWidth] = useSidebarWidth();
  const actualSidebarWidth = !sidebarOpen
    ? 0
    : sidebarFloating
    ? 'calc(10vw + 400px)'
    : sidebarWidth;
  const mainWidth =
    sidebarOpen && !sidebarFloating ? `calc(100% - ${sidebarWidth}px)` : '100%';
  const [resizing] = useSidebarResizing();

  const onResizeStart = useCallback(() => {
    let resized = false;
    function onMouseMove(e: MouseEvent) {
      const newWidth = Math.min(480, Math.max(e.clientX, 256));
      setSliderWidth(newWidth);
      setIsResizing(true);
      resized = true;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener(
      'mouseup',
      () => {
        // if not resized, toggle sidebar
        if (!resized) {
          setSidebarOpen(o => !o);
        }
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
      },
      { once: true }
    );
  }, [setIsResizing, setSidebarOpen, setSliderWidth]);

  const Provider = currentWorkspace
    ? WorkspacePlugins[currentWorkspace.flavour].UI.Provider
    : DefaultProvider;

  return (
    <Provider
      key={`${
        currentWorkspace ? currentWorkspace.flavour : 'default'
      }-provider`}
    >
      <Head>
        <title>{title}</title>
      </Head>
      <StyledPage resizing={resizingSidebar}>
        <WorkSpaceSliderBar
          isPublicWorkspace={isPublicWorkspace}
          onOpenQuickSearchModal={handleOpenQuickSearchModal}
          currentWorkspace={currentWorkspace}
          currentPageId={currentPageId}
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
        <StyledSpacer
          floating={sidebarFloating}
          resizing={resizing}
          sidebarOpen={sidebarOpen}
          style={{ width: actualSidebarWidth }}
        >
          {!sidebarFloating && sidebarOpen && (
            <StyledSliderResizer
              data-testid="sliderBar-resizer"
              isResizing={resizing}
              onMouseDown={onResizeStart}
            >
              <StyledSliderResizerInner isResizing={resizing} />
            </StyledSliderResizer>
          )}
        </StyledSpacer>
        <MainContainerWrapper resizing={resizing} style={{ width: mainWidth }}>
          <MainContainer className="main-container">
            {children}
            <StyledToolWrapper>
              {/* fixme(himself65): remove this */}
              <div id="toolWrapper" style={{ marginBottom: '12px' }}>
                {/* Slot for block hub */}
              </div>
              {!isPublicWorkspace && (
                <HelpIsland
                  showList={
                    router.query.pageId
                      ? undefined
                      : config.enableChangeLog
                      ? ['whatNew', 'contact']
                      : ['contact']
                  }
                />
              )}
            </StyledToolWrapper>
          </MainContainer>
        </MainContainerWrapper>
      </StyledPage>
      <QuickSearch />
    </Provider>
  );
};
