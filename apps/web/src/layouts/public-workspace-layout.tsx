import { MainContainer, WorkspaceFallback } from '@affine/component/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { atom, useAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { FC, PropsWithChildren } from 'react';
import { Suspense } from 'react';

import { getUIAdapter } from '../adapters/workspace';
import { AppContainer } from '../components/affine/app-container';
import { useRouterTitle } from '../hooks/use-router-title';

export const publicWorkspaceIdAtom = atom<string | null>(null);

const PublicWorkspaceLayoutInner: FC<PropsWithChildren> = props => {
  const router = useRouter();
  const title = useRouterTitle(router);
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <AppContainer>
        <MainContainer>
          <Suspense fallback={<WorkspaceFallback />}>{props.children}</Suspense>
        </MainContainer>
      </AppContainer>
    </>
  );
};

export const PublicWorkspaceLayout: FC<PropsWithChildren> = props => {
  const { Provider } = getUIAdapter(WorkspaceFlavour.AFFINE_PUBLIC);
  const router = useRouter();
  const routerWorkspaceId = router.query.workspaceId;
  const [publicWorkspaceId, setPublicWorkspaceId] = useAtom(
    publicWorkspaceIdAtom
  );

  if (!router.isReady) {
    return <WorkspaceFallback key="router-is-loading" />;
  }

  if (typeof routerWorkspaceId !== 'string') {
    router.push('404').catch(console.error);
  } else if (publicWorkspaceId !== routerWorkspaceId) {
    setPublicWorkspaceId(routerWorkspaceId);
  }

  if (publicWorkspaceId === null) {
    return <WorkspaceFallback key="workspace-id-is-null" />;
  }

  return (
    <PublicWorkspaceLayoutInner>
      <Provider>{props.children}</Provider>
    </PublicWorkspaceLayoutInner>
  );
};
