import { Button } from '@affine/component';
import { useAtom } from 'jotai/index';
import { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { openWorkspacesModalAtom } from '../atoms';
import WorkSpaceSliderBar from '../components/pure/workspace-slider-bar';
import { useCurrentPage } from '../hooks/current/use-current-page';
import { useCurrentUser } from '../hooks/current/use-current-user';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { usePageMeta } from '../hooks/use-page-meta';
import { prefetchNecessaryData } from '../hooks/use-workspaces';
import { StyledPage } from '../layouts';
import { RemWorkspace } from '../shared';
import { apis } from '../shared/apis';

const Editor = dynamic(
  async () => (await import('../components/BlockSuiteEditor')).Editor,
  {
    ssr: false,
  }
);

function WorkspacePagePreview({ workspace }: { workspace: RemWorkspace }) {
  const [, setId] = useCurrentPage();
  const pageMetas = usePageMeta(
    'blockSuiteWorkspace' in workspace
      ? workspace.blockSuiteWorkspace
      : undefined
  );
  if (workspace.flavour === 'affine' && !workspace.firstBinarySynced) {
    return <div>loading...</div>;
  }
  return (
    <div>
      <div>page list</div>
      <div
        style={{
          border: '1px solid black',
        }}
      >
        {pageMetas.map(pageMeta => {
          return (
            <div
              onClick={() => {
                setId(pageMeta.id);
              }}
              key={pageMeta.id}
            >
              {pageMeta.title || 'Untitled'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

prefetchNecessaryData();

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

const IndexPage: NextPage = () => {
  const user = useCurrentUser();
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
      {user ? (
        <Button
          onClick={async () => {
            apis.auth.clear();
            await apis.signOutFirebase();
            router.reload();
          }}
        >
          sign out
        </Button>
      ) : (
        <Button
          onClick={async () => {
            await apis.signInWithGoogle();
            router.reload();
          }}
        >
          {' '}
          sign in with google
        </Button>
      )}
      {currentWorkspace ? (
        <WorkspacePagePreview workspace={currentWorkspace} />
      ) : (
        <div>no current workspace</div>
      )}
      {currentPage ? (
        <Editor page={currentPage} key={currentPage.id} />
      ) : (
        <div>no current page</div>
      )}
    </StyledPage>
  );
};

export default IndexPage;
