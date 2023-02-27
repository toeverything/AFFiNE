import { setUpLanguage, useTranslation } from '@affine/i18n';
import { assertExists, uuidv4 } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { openQuickSearchModalAtom, openWorkspacesModalAtom } from '../atoms';
import { HelpIsland } from '../components/pure/help-island';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPageId } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../hooks/use-blocksuite-workspace-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import { useSyncWorkspaces } from '../hooks/use-workspaces';
import { pathGenerator, publicPathGenerator } from '../shared';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';

const sideBarOpenAtom = atomWithStorage('sideBarOpen', false);

export const WorkspaceLayout: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    // todo(himself65): this is a hack, we should use a better way to set the language
    setUpLanguage(i18n);
  }, [i18n]);

  const [show, setShow] = useAtom(sideBarOpenAtom);
  useSyncWorkspaces();
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPageId] = useCurrentPageId();
  useEffect(() => {
    if (currentWorkspace && 'providers' in currentWorkspace) {
      currentWorkspace.providers.forEach(provider => {
        provider.connect();
      });
      return () => {
        currentWorkspace.providers.forEach(provider => {
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
    return helper.createPage(uuidv4());
  }, [helper]);
  const handleOpenWorkspaceListModal = useCallback(() => {
    setOpenWorkspacesModal(true);
  }, [setOpenWorkspacesModal]);
  const handleOpenQuickSearchModal = useCallback(() => {
    setOpenQuickSearchModalAtom(true);
  }, [setOpenQuickSearchModalAtom]);

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
