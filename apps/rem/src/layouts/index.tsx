import { assertExists, uuidv4 } from '@blocksuite/store';
import { useAtom } from 'jotai/index';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';

import { openQuickSearchModalAtom, openWorkspacesModalAtom } from '../atoms';
import { BlockSuiteErrorBoundary } from '../components/blocksuite/block-suite-error-eoundary';
import { HelpIsland } from '../components/pure/help-island';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPageId } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../hooks/use-blocksuite-workspace-helper';
import { useRouterTitle } from '../hooks/use-router-title';
import { useSyncWorkspaces } from '../hooks/use-workspaces';
import { pathGenerator, publicPathGenerator } from '../shared';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';

export const WorkspaceLayout: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
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
  const [show, setShow] = useState(false);
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace?.blockSuiteWorkspace ?? null
  );
  const isPublicWorkspace =
    router.pathname.split('/')[1] === 'public-workspace';
  const title = useRouterTitle(router);
  const [, setOpenQuickSearchModalAtom] = useAtom(openQuickSearchModalAtom);
  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>
      <StyledPage>
        <WorkSpaceSliderBar
          isPublicWorkspace={isPublicWorkspace}
          onOpenQuickSearchModal={useCallback(() => {
            setOpenQuickSearchModalAtom(true);
          }, [setOpenQuickSearchModalAtom])}
          currentWorkspace={currentWorkspace}
          currentPageId={currentPageId}
          onOpenWorkspaceListModal={useCallback(() => {
            setOpenWorkspacesModal(true);
          }, [setOpenWorkspacesModal])}
          openPage={useCallback(
            pageId => {
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
          )}
          createPage={useCallback(async () => {
            return helper.createPage(uuidv4());
          }, [helper])}
          show={show}
          setShow={setShow}
          currentPath={useRouter().asPath}
          paths={isPublicWorkspace ? publicPathGenerator : pathGenerator}
        />
        <StyledWrapper>
          <BlockSuiteErrorBoundary router={router}>
            {children}
          </BlockSuiteErrorBoundary>
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
