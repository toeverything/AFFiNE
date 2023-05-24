import { AppContainer, MainContainer } from '@affine/component/workspace';
import type { AffinePublicWorkspace } from '@affine/workspace/type';
import { useAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type React from 'react';
import { lazy, Suspense } from 'react';

import { openQuickSearchModalAtom } from '../atoms';
import { useRouterTitle } from '../hooks/use-router-title';

const QuickSearchModal = lazy(() =>
  import('../components/pure/quick-search-modal').then(module => ({
    default: module.QuickSearchModal,
  }))
);

type PublicQuickSearchProps = {
  workspace: AffinePublicWorkspace;
};

export const PublicQuickSearch: React.FC<PublicQuickSearchProps> = ({
  workspace,
}) => {
  const router = useRouter();
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );
  return (
    <Suspense>
      <QuickSearchModal
        blockSuiteWorkspace={workspace.blockSuiteWorkspace}
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
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <AppContainer>
        <MainContainer>{props.children}</MainContainer>
      </AppContainer>
    </>
  );
};

export const PublicWorkspaceLayout: React.FC<
  React.PropsWithChildren
> = props => {
  return (
    <PublicWorkspaceLayoutInner>{props.children}</PublicWorkspaceLayoutInner>
  );
};
