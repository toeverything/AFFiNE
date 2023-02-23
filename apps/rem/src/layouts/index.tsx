import { useAtom } from 'jotai/index';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';

import { openWorkspacesModalAtom } from '../atoms';
import { HelpIsland } from '../components/pure/help-island';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPage } from '../hooks/current/use-current-page';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { prefetchNecessaryData } from '../hooks/use-workspaces';
import { StyledPage, StyledToolWrapper, StyledWrapper } from './styles';

const paths = {
  all: workspaceId => (workspaceId ? `/workspace/${workspaceId}/all` : ''),
  favorite: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/favorite` : '',
  trash: workspaceId => (workspaceId ? `/workspace/${workspaceId}/trash` : ''),
  setting: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/setting` : '',
} satisfies {
  all: (workspaceId: string | null) => string;
  favorite: (workspaceId: string | null) => string;
  trash: (workspaceId: string | null) => string;
  setting: (workspaceId: string | null) => string;
};

export const WorkspaceLayout: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentPage] = useCurrentPage();
  useEffect(() => {
    prefetchNecessaryData();
  }, []);
  useEffect(() => {
    if (currentWorkspace?.flavour === 'affine') {
      if (currentWorkspace.firstBinarySynced) {
        currentWorkspace.providers.forEach(provider => {
          provider.connect();
        });
        return () => {
          currentWorkspace.providers.forEach(provider => {
            provider.disconnect();
          });
        };
      }
    }
  }, [currentWorkspace]);
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  return (
    <StyledPage>
      <WorkSpaceSliderBar
        triggerQuickSearchModal={function (): void {
          throw new Error('Function not implemented.');
        }}
        currentWorkspace={currentWorkspace}
        currentPageId={currentPage?.id ?? null}
        onClickWorkspaceListModal={useCallback(() => {
          setOpenWorkspacesModal(true);
        }, [setOpenWorkspacesModal])}
        openPage={function (pageId: string): void {
          throw new Error('Function not implemented.');
        }}
        createPage={function (): Promise<string | null> {
          throw new Error('Function not implemented.');
        }}
        show={show}
        setShow={setShow}
        currentPath={useRouter().asPath}
        paths={paths}
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
  );
};
