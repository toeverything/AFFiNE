import { SidebarSkeleton } from '@affine/component/sidebar-skeleton';
import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import { setUpLanguage, useTranslation } from '@affine/i18n';
import { useRouter } from '@affine/jotai';
import { createAffineGlobalChannel } from '@affine/workspace/affine/sync';
import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import type { FC, PropsWithChildren } from 'react';
import { lazy, Suspense, useEffect } from 'react';

import { currentWorkspaceIdAtom, openQuickSearchModalAtom } from '../atoms';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { HelpIsland } from '../components/pure/help-island';
import { PageLoading } from '../components/pure/loading';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useCreateFirstWorkspace } from '../hooks/use-create-first-workspace';
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
import {
  MainContainer,
  MainContainerWrapper,
  StyledPage,
  StyledToolWrapper,
} from './styles';

declare global {
  // eslint-disable-next-line no-var
  var currentWorkspace: AllWorkspace;
}

const QuickSearchModal = lazy(() =>
  import('../components/pure/quick-search-modal').then(module => ({
    default: module.QuickSearchModal,
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
      <>
        {/* fixme(himself65): don't re-render whole modals */}
        <ModalProvider key={currentWorkspaceId} />
        <Suspense fallback={<PageLoading />}>
          <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
        </Suspense>
      </>
    );
  };

const WorkspaceSidebarLayout = lazy(() =>
  import('./workspace-sidebar-layout').then(module => ({
    default: module.WorkspaceSidebarLayout,
  }))
);

export const WorkspaceLayoutInner: FC<PropsWithChildren> = ({ children }) => {
  const [currentWorkspace] = useCurrentWorkspace();
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

  const Provider = currentWorkspace
    ? WorkspacePlugins[currentWorkspace.flavour].UI.Provider
    : DefaultProvider;
  const title = useRouterTitle(router);
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';

  const [resizing] = useSidebarResizing();
  const [resizingSidebar, setIsResizing] = useSidebarResizing();
  const [sidebarOpen, setSidebarOpen] = useSidebarStatus();
  const sidebarFloating = useSidebarFloating();
  const [sidebarWidth, setSliderWidth] = useSidebarWidth();

  const mainWidth =
    sidebarOpen && !sidebarFloating ? `calc(100% - ${sidebarWidth}px)` : '100%';

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
        <Suspense fallback={<SidebarSkeleton />}>
          <WorkspaceSidebarLayout />
        </Suspense>
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
