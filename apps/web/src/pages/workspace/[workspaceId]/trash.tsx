import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { BlockSuitePageList } from '../../../components/blocksuite/block-suite-page-list';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const TrashPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  const t = useAFFiNEI18N();
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId).catch(error => {
          console.error(error);
        });
      }
    },
    [currentWorkspace, jumpToPage]
  );
  // todo(himself65): refactor to plugin
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  const { Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Head>
        <title>{t['Trash']()} - AFFiNE</title>
      </Head>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.TRASH,
        }}
      />
      <BlockSuitePageList
        blockSuiteWorkspace={blockSuiteWorkspace}
        onOpenPage={onClickPage}
        listType="trash"
      />
    </>
  );
};

export default TrashPage;

TrashPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
