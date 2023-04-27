import type { BlockSuiteFeatureFlags } from '@affine/env';
import { config } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback, useEffect } from 'react';

import { rootCurrentWorkspaceAtom } from '../../../atoms/root';
import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { useReferenceLinkEffect } from '../../../hooks/affine/use-reference-link-effect';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { usePinboardHandler } from '../../../hooks/use-pinboard-handler';
import { useSyncRecentViewsWithRouter } from '../../../hooks/use-recent-views';
import { useRouterAndWorkspaceWithPageIdDefense } from '../../../hooks/use-router-and-workspace-with-page-id-defense';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import { WorkspacePlugins } from '../../../plugins';
import type { BlockSuiteWorkspace, NextPageWithLayout } from '../../../shared';

function setEditorFlags(blockSuiteWorkspace: BlockSuiteWorkspace) {
  Object.entries(config.editorFlags).forEach(([key, value]) => {
    blockSuiteWorkspace.awarenessStore.setFlag(
      key as keyof BlockSuiteFeatureFlags,
      value
    );
  });
}

const WorkspaceDetail: React.FC = () => {
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  assertExists(currentWorkspace);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const { setPageMeta, getPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const { deletePin } = usePinboardHandler({
    blockSuiteWorkspace,
    metas: useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace),
  });

  useSyncRecentViewsWithRouter(router, blockSuiteWorkspace);

  useReferenceLinkEffect({
    pageLinkClicked: useCallback(
      ({ pageId }: { pageId: string }) => {
        assertExists(currentWorkspace);
        return openPage(currentWorkspace.id, pageId);
      },
      [currentWorkspace, openPage]
    ),
    subpageUnlinked: useCallback(
      ({ pageId }: { pageId: string }) => {
        deletePin(pageId);
      },
      [deletePin]
    ),
    subpageLinked: useCallback(
      ({ pageId }: { pageId: string }) => {
        const meta = currentPageId && getPageMeta(currentPageId);
        if (!meta || meta.subpageIds?.includes(pageId)) {
          return;
        }
        setPageMeta(currentPageId, {
          subpageIds: [...(meta.subpageIds ?? []), pageId],
        });
      },
      [currentPageId, getPageMeta, setPageMeta]
    ),
  });

  useEffect(() => {
    if (currentWorkspace) {
      setEditorFlags(currentWorkspace.blockSuiteWorkspace);
    }
  }, [currentWorkspace]);
  if (!currentPageId) {
    return <PageLoading text={t('Loading Page')} />;
  }
  if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
      />
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const PageDetail = WorkspacePlugins[currentWorkspace.flavour].UI.PageDetail;
    return (
      <PageDetail
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
      />
    );
  }
  throw new Unreachable();
};

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const { t } = useTranslation();
  useRouterAndWorkspaceWithPageIdDefense(router);
  const page = useBlockSuiteWorkspacePage(
    currentWorkspace.blockSuiteWorkspace,
    currentPageId
  );
  if (!router.isReady) {
    return <PageLoading text={t('Router is Loading')} />;
  } else if (!currentPageId || !page) {
    return <PageLoading text={t('Page is Loading')} />;
  }
  return <WorkspaceDetail />;
};

export default WorkspaceDetailPage;

WorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
