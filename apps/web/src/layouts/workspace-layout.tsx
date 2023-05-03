import { DebugLogger } from '@affine/debug';
import { DEFAULT_HELLO_WORLD_PAGE_ID } from '@affine/env';
import { initPage } from '@affine/env/blocksuite';
import { setUpLanguage, useTranslation } from '@affine/i18n';
import { createAffineGlobalChannel } from '@affine/workspace/affine/sync';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
  rootStore,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import type { BackgroundProvider } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { FC, PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';

import { openQuickSearchModalAtom, openWorkspacesModalAtom } from '../atoms';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { HelpIsland } from '../components/pure/help-island';
import { PageLoading } from '../components/pure/loading';
import { RootAppSidebar } from '../components/root-app-sidebar';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useRouterHelper } from '../hooks/use-router-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import { useRouterWithWorkspaceIdDefense } from '../hooks/use-router-with-workspace-id-defense';
import { useSyncRouterWithCurrentPageId } from '../hooks/use-sync-router-with-current-page-id';
import { useSyncRouterWithCurrentWorkspaceId } from '../hooks/use-sync-router-with-current-workspace-id';
import { useWorkspaces } from '../hooks/use-workspaces';
import { WorkspacePlugins } from '../plugins';
import { ModalProvider } from '../providers/ModalProvider';
import type { AllWorkspace } from '../shared';
import { pathGenerator, publicPathGenerator } from '../shared';
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
        workspace.providers.filter(
          (provider): provider is BackgroundProvider =>
            'background' in provider && provider.background
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

export const CurrentWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactElement => {
  const router = useRouter();
  const workspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
  useSyncRouterWithCurrentWorkspaceId(router);
  useSyncRouterWithCurrentPageId(router);
  useRouterWithWorkspaceIdDefense(router);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const exist = metadata.find(m => m.id === workspaceId);
  const { t } = useTranslation();
  if (!router.isReady) {
    return <PageLoading text={t('Router is Loading')} />;
  }
  if (!workspaceId) {
    return <PageLoading text={t('Finding Workspace ID')} />;
  }
  if (!exist) {
    return <PageLoading text={t('Workspace Not Found')} />;
  }
  return <>{children}</>;
};

export const WorkspaceLayout: FC<PropsWithChildren> =
  function WorkspacesSuspense({ children }) {
    const { i18n, t } = useTranslation();
    useEffect(() => {
      document.documentElement.lang = i18n.language;
      // todo(himself65): this is a hack, we should use a better way to set the language
      setUpLanguage(i18n);
    }, [i18n]);
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
      const lists = Object.values(WorkspacePlugins)
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

    const Provider =
      (meta && WorkspacePlugins[meta.flavour].UI.Provider) ?? DefaultProvider;
    return (
      <>
        {/* fixme(himself65): don't re-render whole modals */}
        <AllWorkspaceContext>
          <CurrentWorkspaceContext>
            <ModalProvider key={currentWorkspaceId} />
          </CurrentWorkspaceContext>
        </AllWorkspaceContext>
        <CurrentWorkspaceContext>
          <Suspense
            fallback={<PageLoading text={t('Finding Current Workspace')} />}
          >
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
  const { t } = useTranslation();

  useEffect(() => {
    logger.info('currentWorkspace: ', currentWorkspace);
    globalThis.currentWorkspace = currentWorkspace;
  }, [currentWorkspace]);

  //#region init workspace
  if (currentWorkspace.blockSuiteWorkspace.isEmpty) {
    // this is a new workspace, so we should redirect to the new page
    const pageId = nanoid();
    const page = currentWorkspace.blockSuiteWorkspace.createPage(pageId);
    assertEquals(page.id, pageId);
    currentWorkspace.blockSuiteWorkspace.setPageMeta(page.id, {
      init: true,
    });
    initPage(page);
    if (!router.query.pageId) {
      setCurrentPageId(pageId);
      void jumpToPage(currentWorkspace.id, pageId);
    }
  }

  // fixme: pinboard has been removed,
  //  the related code should be removed in the future.
  // no matter the workspace is empty, ensure the root pinboard exists
  // ensureRootPinboard(currentWorkspace.blockSuiteWorkspace);
  //#endregion

  useEffect(() => {
    const backgroundProviders = currentWorkspace.providers.filter(
      (provider): provider is BackgroundProvider => 'background' in provider
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
      void jumpToPage(currentWorkspace.id, page.id);
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

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <StyledPage>
        <RootAppSidebar
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
        <MainContainerWrapper>
          <MainContainer className="main-container">
            <Suspense fallback={<PageLoading text={t('Page is Loading')} />}>
              {children}
            </Suspense>
            <StyledToolWrapper>
              {/* fixme(himself65): remove this */}
              <div id="toolWrapper" style={{ marginBottom: '12px' }}>
                {/* Slot for block hub */}
              </div>
              {!isPublicWorkspace && (
                <HelpIsland
                  showList={
                    router.query.pageId ? undefined : ['whatNew', 'contact']
                  }
                />
              )}
            </StyledToolWrapper>
          </MainContainer>
        </MainContainerWrapper>
      </StyledPage>
      <QuickSearch />
    </>
  );
};
