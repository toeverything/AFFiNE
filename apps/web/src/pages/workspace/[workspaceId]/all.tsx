import { Button } from '@affine/component';
import {
  FilterList,
  SaveViewButton,
  useAllPageSetting,
  ViewList,
} from '@affine/component/page-list';
import { config } from '@affine/env';
import { QueryParamError, Unreachable } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { FolderIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import { WorkspaceAdapters } from '../../../adapters/workspace';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const setting = useAllPageSetting();
  const { jumpToPage } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  const t = useAFFiNEI18N();
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId);
      }
    },
    [currentWorkspace, jumpToPage]
  );
  if (!router.isReady) {
    return <PageLoading />;
  }
  if (typeof router.query.workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', router.query.workspaceId);
  }
  const leftSlot = config.enableAllPageFilter && (
    <ViewList setting={setting}></ViewList>
  );
  const filterContainer = config.enableAllPageFilter &&
    setting.currentView.filterList.length > 0 && (
      <div style={{ padding: 12, display: 'flex' }}>
        <div style={{ flex: 1 }}>
          <FilterList
            value={setting.currentView.filterList}
            onChange={filterList =>
              setting.changeView(
                {
                  ...setting.currentView,
                  filterList,
                },
                setting.currentViewIndex
              )
            }
          />
        </div>
        <div>
          {setting.currentViewIndex == null ? (
            <SaveViewButton
              init={setting.currentView.filterList}
              onConfirm={setting.createView}
            ></SaveViewButton>
          ) : (
            <Button onClick={() => setting.selectView()}>Back to all</Button>
          )}
        </div>
      </div>
    );
  if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const PageList = WorkspaceAdapters[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t['All pages']()} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<FolderIcon />}
          leftSlot={leftSlot}
        >
          {t['All pages']()}
        </WorkspaceTitle>
        {filterContainer}
        <PageList
          view={setting.currentView}
          onOpenPage={onClickPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const PageList = WorkspaceAdapters[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t['All pages']()} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<FolderIcon />}
          leftSlot={leftSlot}
        >
          {t['All pages']()}
        </WorkspaceTitle>
        {filterContainer}
        <PageList
          view={setting.currentView}
          onOpenPage={onClickPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  }
  throw new Unreachable();
};

export default AllPage;

AllPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
