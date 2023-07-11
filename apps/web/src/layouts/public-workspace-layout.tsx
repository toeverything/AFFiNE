import { MainContainer, WorkspaceFallback } from '@affine/component/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/global/utils';
import type { ActiveDocProvider, Workspace } from '@blocksuite/store';
import { atom, useAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { FC, PropsWithChildren } from 'react';
import { Suspense } from 'react';

import { getUIAdapter } from '../adapters/workspace';
import { AppContainer } from '../components/affine/app-container';
import { useRouterTitle } from '../hooks/use-router-title';

// todo: unify this with current workspaceId/pageId atom
export const publicWorkspaceIdAtom = atom<string | null>(null);
export const publicWorkspacePageIdAtom = atom<string | null>(null);

export const publicWorkspaceAtom = atom<Promise<Workspace>>(async get => {
  const workspaceId = get(publicWorkspaceIdAtom);
  assertExists(workspaceId);
  const workspace = createEmptyBlockSuiteWorkspace(
    workspaceId,
    WorkspaceFlavour.AFFINE_PUBLIC
  );
  const activeProviders = workspace.providers.filter(
    (provider): provider is ActiveDocProvider => 'active' in provider
  );
  for (const provider of activeProviders) {
    await provider.sync();
  }
  return workspace;
});

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
  const routerPageId = router.query.pageId;
  const [publicWorkspaceId, setPublicWorkspaceId] = useAtom(
    publicWorkspaceIdAtom
  );
  const [publicPageId, setPublicPageId] = useAtom(publicWorkspacePageIdAtom);

  if (!router.isReady) {
    return <WorkspaceFallback key="router-is-loading" />;
  }

  if (typeof routerWorkspaceId !== 'string') {
    router.push('404').catch(console.error);
  } else if (publicWorkspaceId !== routerWorkspaceId) {
    setPublicWorkspaceId(routerWorkspaceId);
  }
  if (typeof routerPageId === 'string') {
    setPublicPageId(routerPageId);
  }

  if (publicWorkspaceId === null) {
    return <WorkspaceFallback key="workspace-id-is-null" />;
  }

  if (
    router.pathname === '/share/[workspaceId]/[pageId]' &&
    publicPageId === null
  ) {
    return <WorkspaceFallback key="page-id-is-null" />;
  }

  return (
    <PublicWorkspaceLayoutInner>
      <Provider>{props.children}</Provider>
    </PublicWorkspaceLayoutInner>
  );
};
