import { assertEquals } from '@blocksuite/store';
import React from 'react';
import { preload } from 'swr';

import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import {
  AffineRemoteUnSyncedWorkspace,
  LoadPriority,
  RemWorkspaceFlavour,
} from '../../shared';
import { apis } from '../../shared/apis';
import { WorkspacePlugin } from '..';
import { fetcher, QueryKey } from './fetcher';

export const AffinePlugin: WorkspacePlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  loadPriority: LoadPriority.HIGH,
  deleteWorkspace: async workspace => {
    await apis.deleteWorkspace({
      id: workspace.id,
    });
    if (workspace.firstBinarySynced) {
      workspace.providers.forEach(p => p.cleanup());
    }
  },
  prefetchData: async dataCenter => {
    const promise: Promise<AffineRemoteUnSyncedWorkspace[]> = preload(
      QueryKey.getWorkspaces,
      fetcher
    );
    return promise
      .then(async workspaces => {
        const promises = workspaces.map(workspace => {
          assertEquals(workspace.flavour, RemWorkspaceFlavour.AFFINE);
          if (!workspace.firstBinarySynced) {
            return workspace.syncBinary();
          }
          return workspace;
        });
        return Promise.all(promises).then(workspaces => {
          workspaces.forEach(workspace => {
            if (workspace === null) {
              return;
            }
            const exist = dataCenter.workspaces.findIndex(
              ws => ws.id === workspace.id
            );
            if (exist !== -1) {
              dataCenter.workspaces.splice(exist, 1, workspace);
              dataCenter.workspaces = [...dataCenter.workspaces];
            } else {
              dataCenter.workspaces = [...dataCenter.workspaces, workspace];
            }
          });
        });
      })
      .catch(error => {
        console.error(error);
      });
  },
  PageDetail: ({ currentWorkspace, currentPageId }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>Loading</div>;
    }
    const page = currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(
        currentWorkspace.blockSuiteWorkspace,
        currentPageId
      );
    }
    return (
      <>
        <PageDetailEditor
          pageId={currentPageId}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  },
  PageList: ({ blockSuiteWorkspace, onOpenPage }) => {
    return (
      <BlockSuitePageList
        onOpenPage={onOpenPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
  SettingsDetail: ({
    currentWorkspace,
    onChangeTab,
    currentTab,
    onDeleteWorkspace,
  }) => {
    return (
      <WorkspaceSettingDetail
        onDeleteWorkspace={onDeleteWorkspace}
        onChangeTab={onChangeTab}
        currentTab={currentTab}
        workspace={currentWorkspace}
      />
    );
  },
};
