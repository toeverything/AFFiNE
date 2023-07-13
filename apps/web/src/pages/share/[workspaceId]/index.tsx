import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtomValue } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useMemo } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { RouteLogic, useRouterHelper } from '../../../hooks/use-router-helper';
import {
  publicWorkspaceAtom,
  PublicWorkspaceLayout,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const ShareWorkspacePage: NextPageWithLayout = () => {
  const workspace = useAtomValue(publicWorkspaceAtom);
  const t = useAFFiNEI18N();
  const { PageList, Header } = getUIAdapter(WorkspaceFlavour.AFFINE_PUBLIC);
  const { jumpToPublicWorkspacePage } = useRouterHelper(useRouter());
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
        collection={useMemo(
          () => ({
            id: 'NIL',
            workspaceId: workspace.id,
            name: 'NONE',
            filterList: [],
          }),
          [workspace.id]
        )}
        onOpenPage={useCallback(
          async (pageId, newTab) => {
            return jumpToPublicWorkspacePage(
              workspace.id,
              pageId,
              newTab ? RouteLogic.NEW_TAB : RouteLogic.PUSH
            );
          },
          [workspace.id, jumpToPublicWorkspacePage]
        )}
        blockSuiteWorkspace={workspace}
      />
    </>
  );
};

export default ShareWorkspacePage;

ShareWorkspacePage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
