import { ListSkeleton } from '@affine/component';
import { useAtomValue } from 'jotai';
import { useAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type React from 'react';
import { lazy, Suspense } from 'react';

import { openQuickSearchModalAtom } from '../atoms';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { StyledTableContainer } from '../components/blocksuite/block-suite-page-list/page-list/styles';
import { useRouterTitle } from '../hooks/use-router-title';
import { MainContainer, StyledPage } from './styles';

const QuickSearchModal = lazy(() =>
  import('../components/pure/quick-search-modal').then(module => ({
    default: module.QuickSearchModal,
  }))
);

export const PublicQuickSearch: React.FC = () => {
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

const PublicWorkspaceLayoutInner: React.FC<React.PropsWithChildren> = props => {
  const router = useRouter();
  const title = useRouterTitle(router);
  const workspaceId = useAtomValue(publicWorkspaceIdAtom);
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <StyledPage>
        <MainContainer className="main-container">
          {props.children}
        </MainContainer>
        <Suspense fallback="">
          {/* `publicBlockSuiteAtom` is available only when `publicWorkspaceIdAtom` loaded */}
          {workspaceId && <PublicQuickSearch />}
        </Suspense>
      </StyledPage>
    </>
  );
};

export const PublicWorkspaceLayout: React.FC<
  React.PropsWithChildren
> = props => {
  return (
    <Suspense
      fallback={
        <StyledTableContainer>
          <ListSkeleton />
        </StyledTableContainer>
      }
    >
      <PublicWorkspaceLayoutInner>{props.children}</PublicWorkspaceLayoutInner>
    </Suspense>
  );
};
