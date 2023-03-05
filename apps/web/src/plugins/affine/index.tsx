import { createJSONStorage } from 'jotai/utils';
import React from 'react';
import { preload } from 'swr';
import { z } from 'zod';

import { createAffineProviders } from '../../blocksuite';
import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import {
  AffineWorkspace,
  BlockSuiteWorkspace,
  LoadPriority,
  RemWorkspaceFlavour,
} from '../../shared';
import { apis } from '../../shared/apis';
import { createEmptyBlockSuiteWorkspace } from '../../utils';
import { WorkspacePlugin } from '..';
import { fetcher, QueryKey } from './fetcher';

const storage = createJSONStorage(() => localStorage);
const kAffineLocal = 'affine-local-storage-v2';
const schema = z.object({
  id: z.string(),
  type: z.number(),
  public: z.boolean(),
  permission: z.number(),
  create_at: z.number(),
});

export const AffinePlugin: WorkspacePlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  loadPriority: LoadPriority.HIGH,
  CRUD: {
    create: async blockSuiteWorkspace => {
      const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdate(
        blockSuiteWorkspace.doc
      );
      const { id } = await apis.createWorkspace(new Blob([binary.buffer]));
      return id;
    },
    delete: async workspace => {
      await apis.deleteWorkspace({
        id: workspace.id,
      });
    },
    get: async workspaceId => {
      const workspaces: AffineWorkspace[] = await preload(
        QueryKey.getWorkspaces,
        fetcher
      );

      const workspace = workspaces.find(
        workspace => workspace.id === workspaceId
      );
      const dump = workspaces.map(workspace => {
        return {
          id: workspace.id,
          type: workspace.type,
          public: workspace.public,
          permission: workspace.permission,
          create_at: workspace.create_at,
        } satisfies z.infer<typeof schema>;
      });
      storage.setItem(kAffineLocal, dump);
      if (!workspace) {
        return null;
      }
      return workspace;
    },
    list: async () => {
      // fixme: refactor auth check
      if (!apis.auth.isLogin) return [];
      return await apis.getWorkspaces().then(workspaces => {
        return workspaces.map(workspace => {
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
            workspace.id,
            (k: string) =>
              // fixme: token could be expired
              ({ api: '/api/workspace', token: apis.auth.token }[k])
          );
          const affineWorkspace: AffineWorkspace = {
            ...workspace,
            flavour: RemWorkspaceFlavour.AFFINE,
            blockSuiteWorkspace,
            providers: [...createAffineProviders(blockSuiteWorkspace)],
          };
          return affineWorkspace;
        });
      });
    },
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
