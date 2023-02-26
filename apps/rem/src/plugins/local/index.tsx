import { uuidv4 } from '@blocksuite/store';
import React from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';

import { createLocalProviders } from '../../blocksuite';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { PageNotFoundError } from '../../components/blocksuite/block-suite-error-eoundary';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import {
  LoadPriority,
  LocalWorkspace,
  RemWorkspaceFlavour,
} from '../../shared';
import { config } from '../../shared/env';
import { createEmptyBlockSuiteWorkspace } from '../../utils';
import { WorkspacePlugin } from '..';

export const kStoreKey = 'affine-local-workspace';

export const LocalPlugin: WorkspacePlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  prefetchData: async (dataCenter, signal) => {
    if (typeof window === 'undefined') {
      // SSR mode, no local data
      return;
    }
    if (signal?.aborted) {
      return;
    }
    let ids: string[];
    try {
      ids = JSON.parse(localStorage.getItem(kStoreKey) ?? '[]');
      if (!Array.isArray(ids)) {
        localStorage.setItem(kStoreKey, '[]');
        ids = [];
      }
    } catch (e) {
      localStorage.setItem(kStoreKey, '[]');
      ids = [];
    }
    if (config.enableIndexedDBProvider) {
      const workspaces = await Promise.all(
        ids.map(id => {
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(id);
          const workspace: LocalWorkspace = {
            id,
            flavour: RemWorkspaceFlavour.LOCAL,
            blockSuiteWorkspace: blockSuiteWorkspace,
            providers: [...createLocalProviders(blockSuiteWorkspace)],
            syncBinary: async () => {
              if (!config.enableIndexedDBProvider) {
                return {
                  ...workspace,
                };
              }
              const persistence = new IndexeddbPersistence(
                blockSuiteWorkspace.room as string,
                blockSuiteWorkspace.doc
              );
              return persistence.whenSynced.then(() => {
                persistence.destroy();
                return {
                  ...workspace,
                };
              });
            },
          };
          return workspace.syncBinary();
        })
      );
      workspaces.forEach(workspace => {
        if (workspace) {
          const exist = dataCenter.workspaces.findIndex(
            w => w.id === workspace.id
          );
          if (exist === -1) {
            dataCenter.workspaces = [...dataCenter.workspaces, workspace];
          } else {
            dataCenter.workspaces[exist] = workspace;
            dataCenter.workspaces = [...dataCenter.workspaces];
          }
        }
      });
    }
    if (dataCenter.workspaces.length === 0) {
      if (signal?.aborted) {
        return;
      }
      console.info('no local workspace found, create a new one');
      const workspaceId = uuidv4();
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(workspaceId);
      blockSuiteWorkspace.meta.setName('Untitled Workspace');
      localStorage.setItem(kStoreKey, JSON.stringify([workspaceId]));
      blockSuiteWorkspace.createPage(uuidv4());
      const workspace: LocalWorkspace = {
        id: workspaceId,
        flavour: RemWorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: blockSuiteWorkspace,
        providers: [...createLocalProviders(blockSuiteWorkspace)],
        syncBinary: async () => {
          if (!config.enableIndexedDBProvider) {
            return {
              ...workspace,
            };
          }
          const persistence = new IndexeddbPersistence(
            blockSuiteWorkspace.room as string,
            blockSuiteWorkspace.doc
          );
          return persistence.whenSynced.then(() => {
            persistence.destroy();
            return {
              ...workspace,
            };
          });
        },
      };
      await workspace.syncBinary();
      if (signal?.aborted) {
        const persistence = new IndexeddbPersistence(
          blockSuiteWorkspace.room as string,
          blockSuiteWorkspace.doc
        );
        await persistence.clearData();
        return;
      }
      dataCenter.workspaces = [workspace];
    }
  },
  PageDetail: ({ currentWorkspace, currentPageId }) => {
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
  SettingsDetail: ({ currentWorkspace, onChangeTab, currentTab }) => {
    return (
      <WorkspaceSettingDetail
        onChangeTab={onChangeTab}
        currentTab={currentTab}
        workspace={currentWorkspace}
      />
    );
  },
};
