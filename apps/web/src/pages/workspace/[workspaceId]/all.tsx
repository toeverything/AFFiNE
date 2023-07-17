import { useCollectionManager } from '@affine/component/page-list';
import { QueryParamError } from '@affine/env/constant';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  const setting = useCollectionManager(currentWorkspace.id);
  const t = useAFFiNEI18N();
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId).catch(console.error);
      }
    },
    [currentWorkspace, jumpToPage]
  );
  if (typeof router.query.workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', router.query.workspaceId);
  }

  const { PageList, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Head>
        <title>{t['All pages']()} - AFFiNE</title>
      </Head>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.ALL,
        }}
      />
      <PageList
        collection={setting.currentCollection}
        onOpenPage={onClickPage}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
      />
    </>
  );
};

export default AllPage;

AllPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
