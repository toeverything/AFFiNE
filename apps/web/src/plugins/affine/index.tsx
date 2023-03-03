import { assertEquals } from '@blocksuite/store';
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
  createWorkspace: async (blockSuiteWorkspace: BlockSuiteWorkspace) => {
    const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdate(
      blockSuiteWorkspace.doc
    );
    const { id } = await apis.createWorkspace(new Blob([binary.buffer]));
    return id;
  },
  deleteWorkspace: async workspace => {
    await apis.deleteWorkspace({
      id: workspace.id,
    });
    workspace.providers.forEach(p => p.cleanup());
  },
  prefetchData: async dataCenter => {
    if (localStorage.getItem(kAffineLocal)) {
      const localData = JSON.parse(localStorage.getItem(kAffineLocal) || '[]');
      if (Array.isArray(localData)) {
        const workspacesDump = localData
          .map((item: any) => {
            const result = schema.safeParse(item);
            if (result.success) {
              return result.data;
            }
            return null;
          })
          .filter(Boolean) as z.infer<typeof schema>[];
        const workspaces = workspacesDump.map(workspace => {
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
            workspace.id,
            (k: string) =>
              // fixme: token could be expired
              ({ api: '/api/workspace', token: apis.auth.token }[k])
          );
          const affineWorkspace: AffineWorkspace = {
            ...workspace,
            blockSuiteWorkspace,
            providers: [...createAffineProviders(blockSuiteWorkspace)],
            flavour: RemWorkspaceFlavour.AFFINE,
          };
          return affineWorkspace;
        });

        // fixme: refactor to a function
        workspaces.forEach(workspace => {
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
        dataCenter.callbacks.forEach(cb => cb());
      } else {
        localStorage.removeItem(kAffineLocal);
      }
    }
    const promise: Promise<AffineWorkspace[]> = preload(
      QueryKey.getWorkspaces,
      fetcher
    );
    return promise
      .then(async workspaces => {
        const promises = workspaces.map(workspace => {
          assertEquals(workspace.flavour, RemWorkspaceFlavour.AFFINE);
          return workspace;
        });
        return Promise.all(promises)
          .then(workspaces => {
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
            return workspaces;
          })
          .then(ws => {
            const workspaces = ws.filter(Boolean) as AffineWorkspace[];
            const dump = workspaces.map(workspace => {
              return {
                id: workspace.id,
                type: workspace.type,
                public: workspace.public,
                permission: workspace.permission,
                create_at: workspace.create_at,
              } satisfies z.infer<typeof schema>;
            });
            localStorage.setItem(kAffineLocal, JSON.stringify(dump));
          });
      })
      .catch(error => {
        console.error(error);
      });
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
