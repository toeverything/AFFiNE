import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/global/utils';
import type { ActiveDocProvider, Workspace } from '@blocksuite/store';
import { atom, useAtomValue } from 'jotai';
import Head from 'next/head';
import React, { useCallback } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import {
  publicWorkspaceIdAtom,
  PublicWorkspaceLayout,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const publicWorkspaceAtom = atom<Promise<Workspace>>(async get => {
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

const ShareWorkspacePage: NextPageWithLayout = () => {
  const workspace = useAtomValue(publicWorkspaceAtom);
  const t = useAFFiNEI18N();
  const { PageList, Header } = getUIAdapter(WorkspaceFlavour.AFFINE_PUBLIC);
  return (
    <>
      <Head>
        <title>{t['All pages']()} - AFFiNE</title>
      </Head>
      <Header
        currentWorkspaceId={workspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.ALL,
        }}
      />
      <PageList
        collection={{
          id: 'NIL',
          name: 'NONE',
          filterList: [],
        }}
        onOpenPage={useCallback(() => {}, [])}
        blockSuiteWorkspace={workspace}
      />
    </>
  );
};

export default ShareWorkspacePage;

ShareWorkspacePage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
