import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import { assertEquals, nanoid } from '@blocksuite/store';
import React from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';

import { createLocalProviders } from '../../blocksuite';
import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import {
  LoadPriority,
  LocalWorkspace,
  RemWorkspaceFlavour,
} from '../../shared';
import { createEmptyBlockSuiteWorkspace } from '../../utils';
import { WorkspacePlugin } from '..';

const logger = new DebugLogger('local-plugin');

export const kStoreKey = 'affine-local-workspace';

export const LocalPlugin: WorkspacePlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  createWorkspace: async blockSuiteWorkspace => {
    let ids: string[] = [];
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
    const id = nanoid();
    const persistence = new IndexeddbPersistence(id, blockSuiteWorkspace.doc);
    await persistence.whenSynced.then(() => {
      persistence.destroy();
    });
    ids.push(id);
    localStorage.setItem(kStoreKey, JSON.stringify(ids));
    return id;
  },
  deleteWorkspace: async workspace => {
    const id = workspace.id;
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
    const idx = ids.findIndex(x => x === id);
    if (idx === -1) {
      throw new Error('cannot find local workspace from localStorage');
    }
    workspace.providers.forEach(p => p.cleanup());
    ids.splice(idx, 1);
    assertEquals(
      ids.every(id => typeof id === 'string'),
      true
    );
    localStorage.setItem(kStoreKey, JSON.stringify(ids));
  },
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
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
            id,
            (_: string) => undefined
          );
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
      logger.info('no local workspace found, create a new one');
      const workspaceId = nanoid();
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        workspaceId,
        (_: string) => undefined
      );
      blockSuiteWorkspace.meta.setName('Untitled Workspace');
      localStorage.setItem(kStoreKey, JSON.stringify([workspaceId]));
      blockSuiteWorkspace.createPage(nanoid());
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
    onTransformWorkspace,
  }) => {
    return (
      <WorkspaceSettingDetail
        onDeleteWorkspace={onDeleteWorkspace}
        onChangeTab={onChangeTab}
        currentTab={currentTab}
        workspace={currentWorkspace}
        onTransferWorkspace={onTransformWorkspace}
      />
    );
  },
};
