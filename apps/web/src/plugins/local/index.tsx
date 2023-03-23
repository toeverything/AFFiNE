import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { createJSONStorage } from 'jotai/utils';
import React from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { z } from 'zod';

import { createLocalProviders } from '../../blocksuite';
import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import type { LocalWorkspace } from '../../shared';
import { BlockSuiteWorkspace } from '../../shared';
import { initPage } from '../../utils/blocksuite';
import type { WorkspacePlugin } from '..';

const getStorage = () => createJSONStorage(() => localStorage);

export const kStoreKey = 'affine-local-workspace';
const schema = z.array(z.string());

export const LocalPlugin: WorkspacePlugin<WorkspaceFlavour.LOCAL> = {
  flavour: WorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  CRUD: {
    get: async workspaceId => {
      const storage = getStorage();
      !Array.isArray(storage.getItem(kStoreKey)) &&
        storage.setItem(kStoreKey, []);
      const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
      const id = data.find(id => id === workspaceId);
      if (!id) {
        return null;
      }
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        id,
        (_: string) => undefined
      );
      const workspace: LocalWorkspace = {
        id,
        flavour: WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: blockSuiteWorkspace,
        providers: [...createLocalProviders(blockSuiteWorkspace)],
      };
      return workspace;
    },
    create: async ({ doc }) => {
      const storage = getStorage();
      !Array.isArray(storage.getItem(kStoreKey)) &&
        storage.setItem(kStoreKey, []);
      const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
      const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdateV2(doc);
      const id = nanoid();
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        id,
        (_: string) => undefined
      );
      BlockSuiteWorkspace.Y.applyUpdateV2(blockSuiteWorkspace.doc, binary);
      const persistence = new IndexeddbPersistence(id, blockSuiteWorkspace.doc);
      await persistence.whenSynced.then(() => {
        persistence.destroy();
      });
      storage.setItem(kStoreKey, [...data, id]);
      console.log('create', id, storage.getItem(kStoreKey));
      return id;
    },
    delete: async workspace => {
      const storage = getStorage();
      !Array.isArray(storage.getItem(kStoreKey)) &&
        storage.setItem(kStoreKey, []);
      const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
      const idx = data.findIndex(id => id === workspace.id);
      if (idx === -1) {
        throw new Error('workspace not found');
      }
      data.splice(idx, 1);
      storage.setItem(kStoreKey, [...data]);
    },
    list: async () => {
      const storage = getStorage();
      !Array.isArray(storage.getItem(kStoreKey)) &&
        storage.setItem(kStoreKey, []);
      const data = (
        await Promise.all(
          (storage.getItem(kStoreKey) as z.infer<typeof schema>).map(id =>
            LocalPlugin.CRUD.get(id)
          )
        )
      ).filter(item => item !== null) as LocalWorkspace[];
      if (data.length === 0) {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          (_: string) => undefined
        );
        blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
        await LocalPlugin.CRUD.create(blockSuiteWorkspace);
        return LocalPlugin.CRUD.list();
      }
      return data;
    },
  },
  UI: {
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
            onInit={initPage}
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
  },
};
