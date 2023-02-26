import { assertEquals } from '@blocksuite/store';
import React from 'react';
import { preload } from 'swr';

import { PageNotFoundError } from '../../components/blocksuite/block-suite-error-eoundary';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { WorkspaceSettingDetail } from '../../components/pure/workspace-setting-detail';
import {
  AffineRemoteUnSyncedWorkspace,
  fetcher,
  LoadPriority,
  QueryKey,
  RemWorkspaceFlavour,
} from '../../shared';
import { WorkspacePlugin } from '..';

const WIP = () => <div>WIP</div>;

export const AffinePlugin: WorkspacePlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  loadPriority: LoadPriority.HIGH,
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
  PageList: ({ blockSuiteWorkspace, onClickPage }) => {
    return (
      <BlockSuitePageList
        onClickPage={onClickPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
  SettingsDetail: ({ currentWorkspace }) => {
    return <WorkspaceSettingDetail workspace={currentWorkspace} />;
  },
};
