import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import Head from 'next/head';
import { useRouter } from 'next/router';

import PageList from '../../../components/blocksuite/block-suite-page-list/page-list';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import type { NextPageWithLayout } from '../../../shared';

const Shared: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  useSyncRouterWithCurrentWorkspace(router);

  if (!router.isReady) {
    return <PageLoading />;
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  }
  // todo(himself65): refactor to plugin
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  return (
    <>
      <Head>
        <title>Shared Pages - AFFiNE</title>
      </Head>
      <WorkspaceTitle
        workspace={currentWorkspace}
        currentPage={null}
        isPreview={false}
        isPublic={false}
        icon={<DeleteTemporarilyIcon />}
      >
        Shared Pages
      </WorkspaceTitle>
      <PageList
        blockSuiteWorkspace={blockSuiteWorkspace}
        onClickPage={() => console.log('click page')}
        listType="all"
      />
    </>
  );
};

export default Shared;

Shared.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
