import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { setUpLanguage, useTranslation } from '@affine/i18n';
import { assertExists, nanoid } from '@blocksuite/store';
import { NoSsr } from '@mui/material';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/router';
import React, { Suspense, useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import {
  jotaiWorkspacesAtom,
  openQuickSearchModalAtom,
  openWorkspacesModalAtom,
  workspaceLockAtom,
} from '../atoms';
import { HelpIsland } from '../components/pure/help-island';
import { PageLoading } from '../components/pure/loading';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPageId } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../hooks/use-blocksuite-workspace-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import { useWorkspaces } from '../hooks/use-workspaces';
import { LocalPlugin } from '../plugins/local';
import {
  pathGenerator,
  publicPathGenerator,
  RemWorkspaceFlavour,
} from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';

const sideBarOpenAtom = atomWithStorage('sideBarOpen', true);

export const WorkspaceLayout: React.FC<React.PropsWithChildren> =
  function WorkspacesSuspense({ children }) {
    const { i18n } = useTranslation();
    useEffect(() => {
      document.documentElement.lang = i18n.language;
      // todo(himself65): this is a hack, we should use a better way to set the language
      setUpLanguage(i18n);
    }, [i18n]);
    const [jotaiWorkspaces, set] = useAtom(jotaiWorkspacesAtom);
    useEffect(() => {
      const controller = new AbortController();

      /**
       * Create a first workspace, only just once for a browser
       */
      async function createFirst() {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          (_: string) => undefined
        );
        blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
        const id = await LocalPlugin.CRUD.create(blockSuiteWorkspace);
        set(workspaces => [
          ...workspaces,
          {
            id,
            flavour: RemWorkspaceFlavour.LOCAL,
          },
        ]);
      }
      if (
        jotaiWorkspaces.length === 0 &&
        sessionStorage.getItem('first') === null
      ) {
        sessionStorage.setItem('first', 'true');
        createFirst();
      }
      return () => {
        controller.abort();
      };
    }, [jotaiWorkspaces.length, set]);
    return (
      <NoSsr>
        <Suspense fallback={<PageLoading />}>
          <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
        </Suspense>
      </NoSsr>
    );
  };

export const WorkspaceLayoutInner: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [show, setShow] = useAtom(sideBarOpenAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId] = useCurrentPageId();
  const workspaces = useWorkspaces();

  useEffect(() => {
    console.log(workspaces);
  }, [workspaces]);

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
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace?.blockSuiteWorkspace ?? null
  );
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';
  const title = useRouterTitle(router);
  const [, setOpenQuickSearchModalAtom] = useAtom(openQuickSearchModalAtom);
  const handleOpenPage = useCallback(
    (pageId: string) => {
      assertExists(currentWorkspace);
      router.push({
        pathname: `/${
          isPublicWorkspace ? 'public-workspace' : 'workspace'
        }/[workspaceId]/[pageId]`,
        query: {
          workspaceId: currentWorkspace.id,
          pageId,
        },
      });
    },
    [currentWorkspace, isPublicWorkspace, router]
  );
  const handleCreatePage = useCallback(async () => {
    return helper.createPage(nanoid());
  }, [helper]);
  const handleOpenWorkspaceListModal = useCallback(() => {
    setOpenWorkspacesModal(true);
  }, [setOpenWorkspacesModal]);
  const handleOpenQuickSearchModal = useCallback(() => {
    setOpenQuickSearchModalAtom(true);
  }, [setOpenQuickSearchModalAtom]);
  const lock = useAtomValue(workspaceLockAtom);
  if (lock) {
    return <PageLoading />;
  }

  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>
      <StyledPage>
        <WorkSpaceSliderBar
          isPublicWorkspace={isPublicWorkspace}
          onOpenQuickSearchModal={handleOpenQuickSearchModal}
          currentWorkspace={currentWorkspace}
          currentPageId={currentPageId}
          onOpenWorkspaceListModal={handleOpenWorkspaceListModal}
          openPage={handleOpenPage}
          createPage={handleCreatePage}
          show={show}
          setShow={setShow}
          currentPath={router.asPath}
          paths={isPublicWorkspace ? publicPathGenerator : pathGenerator}
        />
        <StyledWrapper>
          {children}
          <StyledToolWrapper>
            {/* fixme(himself65): remove this */}
            <div id="toolWrapper" style={{ marginBottom: '12px' }}>
              {/* Slot for block hub */}
            </div>
            <HelpIsland
              showList={router.query.pageId ? undefined : ['contact']}
            />
          </StyledToolWrapper>
        </StyledWrapper>
      </StyledPage>
    </>
  );
};
