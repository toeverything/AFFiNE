import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';

import { PageLoading } from '../../../components/pure/loading';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';
import { WorkspaceSubPath } from '../../../shared';

const FavouritePage: NextPageWithLayout = () => {
  const router = useRouter();
  const { jumpToSubPath } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  // const t = useAFFiNEI18N();
  // const onClickPage = useCallback(
  //   (pageId: string, newTab?: boolean) => {
  //     assertExists(currentWorkspace);
  //     if (newTab) {
  //       window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
  //     } else {
  //       jumpToPage(currentWorkspace.id, pageId);
  //     }
  //   },
  //   [currentWorkspace, jumpToPage]
  // );
  if (currentWorkspace === null) {
    return <PageLoading />;
  }

  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
  return (
    <>
      {/* <Head>
        <title>{t['Favorites']()} - AFFiNE</title>
      </Head>
      <WorkspaceTitle
        workspace={currentWorkspace}
        currentPage={null}
        isPreview={false}
        isPublic={false}
        icon={<FavoriteIcon />}
      >
        {t['Favorites']()}
      </WorkspaceTitle>
      <BlockSuitePageList
        blockSuiteWorkspace={blockSuiteWorkspace}
        onOpenPage={onClickPage}
        listType="favorite"
      /> */}
    </>
  );
};

export default FavouritePage;

FavouritePage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
