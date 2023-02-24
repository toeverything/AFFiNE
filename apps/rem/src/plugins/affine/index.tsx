import { Workspace } from '@affine/datacenter';
import dynamic from 'next/dynamic';
import React from 'react';
import { preload } from 'swr';

import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageNotFoundError } from '../../components/BlockSuiteErrorBoundary';
import { PageDetailEditor } from '../../components/page-detail-editor';
import {
  AffineRemoteUnSyncedWorkspace,
  fetcher,
  QueryKey,
  RemWorkspaceFlavour,
  transformToAffineSyncedWorkspace,
} from '../../shared';
import { apis } from '../../shared/apis';
import { createEmptyBlockSuiteWorkspace } from '../../utils';
import { WorkspacePlugin } from '../index';

const WIP = () => <div>WIP</div>;

const Editor = dynamic(
  async () =>
    (await import('../../components/blocksuite/block-suite-editor'))
      .BlockSuiteEditor,
  {
    ssr: false,
  }
);

export const AffinePlugin: WorkspacePlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  prefetchData: async dataCenter => {
    const promise: Promise<Workspace[]> = preload(
      QueryKey.getWorkspaces,
      fetcher
    );
    return promise
      .then(workspaces => {
        workspaces.forEach(workspace => {
          const exist = dataCenter.workspaces.find(
            localWorkspace => localWorkspace.id === workspace.id
          );
          if (!exist) {
            // todo: make this `RemWorkspace`
            const remWorkspace: AffineRemoteUnSyncedWorkspace = {
              ...workspace,
              flavour: RemWorkspaceFlavour.AFFINE,
              firstBinarySynced: false,
              blockSuiteWorkspace: createEmptyBlockSuiteWorkspace(workspace.id),
              syncBinary: async () => {
                const binary = await apis.downloadWorkspace(
                  workspace.id,
                  workspace.public
                );
                if (remWorkspace.firstBinarySynced) {
                  return;
                }
                const syncedWorkspace = await transformToAffineSyncedWorkspace(
                  remWorkspace,
                  binary
                );
                const index = dataCenter.workspaces.findIndex(
                  ws => ws.id === syncedWorkspace.id
                );
                if (index > -1) {
                  dataCenter.workspaces.splice(index, 1, syncedWorkspace);
                  dataCenter.workspaces = [...dataCenter.workspaces];
                  dataCenter.callbacks.forEach(cb => cb());
                }
              },
            };
            dataCenter.workspaces = [...dataCenter.workspaces, remWorkspace];
            Promise.all(
              dataCenter.workspaces.map(workspace => {
                if (workspace.flavour === 'affine') {
                  if (!workspace.firstBinarySynced) {
                    return workspace.syncBinary();
                  }
                }
                return Promise.resolve();
              })
            );
            dataCenter.callbacks.forEach(cb => cb());
          }
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
  Setting: WIP,
};
