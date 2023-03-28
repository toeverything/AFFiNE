import { ListSkeleton } from '@affine/component';
import { useAtomValue } from 'jotai';
import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type React from 'react';
import { Suspense } from 'react';

import { openQuickSearchModalAtom } from '../atoms';
import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../atoms/public-workspace';
import { StyledTableContainer } from '../components/blocksuite/block-suite-page-list/page-list/styles';
import { useRouterTitle } from '../hooks/use-router-title';
import { StyledPage, StyledWrapper } from './styles';

const QuickSearchModal = dynamic(
  () => import('../components/pure/quick-search-modal')
);

export const PublicQuickSearch: React.FC = () => {
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
        <StyledWrapper className="main-container">
          {props.children}
        </StyledWrapper>
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
