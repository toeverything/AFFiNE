import { getLoginStorage } from '@affine/workspace/affine/login';
import type { AffineWorkspace } from '@affine/workspace/type';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { createJSONStorage } from 'jotai/utils';
import React from 'react';
import { mutate } from 'swr';
import { z } from 'zod';

import { createAffineProviders } from '../../blocksuite';
import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { BlockSuiteWorkspace } from '../../shared';
import { affineApis } from '../../shared/apis';
import { initPage } from '../../utils';
import type { WorkspacePlugin } from '..';
import { QueryKey } from './fetcher';

const storage = createJSONStorage(() => localStorage);
const kAffineLocal = 'affine-local-storage-v2';
const schema = z.object({
  id: z.string(),
  type: z.number(),
  public: z.boolean(),
  permission: z.number(),
});

const getPersistenceAllWorkspace = () => {
  const items = storage.getItem(kAffineLocal);
  const allWorkspaces: AffineWorkspace[] = [];
  if (
    Array.isArray(items) &&
    items.every(item => schema.safeParse(item).success)
  ) {
    allWorkspaces.push(
      ...items.map((item: z.infer<typeof schema>) => {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          item.id,
          (k: string) =>
            // fixme: token could be expired
            ({ api: '/api/workspace', token: getLoginStorage()?.token }[k])
        );
        const affineWorkspace: AffineWorkspace = {
          ...item,
          flavour: WorkspaceFlavour.AFFINE,
          blockSuiteWorkspace,
          providers: [...createAffineProviders(blockSuiteWorkspace)],
        };
        return affineWorkspace;
      })
    );
  }
  return allWorkspaces;
};

export const AffinePlugin: WorkspacePlugin<WorkspaceFlavour.AFFINE> = {
  flavour: WorkspaceFlavour.AFFINE,
  loadPriority: LoadPriority.HIGH,
  cleanup: () => {
    storage.removeItem(kAffineLocal);
  },
  CRUD: {
    create: async blockSuiteWorkspace => {
      const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdate(
        blockSuiteWorkspace.doc
      );
      const { id } = await affineApis.createWorkspace(
        new Blob([binary.buffer])
      );
      // fixme: syncing images
      const newWorkspaceId = id;

      await new Promise(resolve => setTimeout(resolve, 1000));
      const blobs = await blockSuiteWorkspace.blobs;
      if (blobs) {
        const ids = await blobs.blobs;
        for (const id of ids) {
          const url = await blobs.get(id);
          if (url) {
            const blob = await fetch(url).then(res => res.blob());
            await affineApis.uploadBlob(
              newWorkspaceId,
              await blob.arrayBuffer(),
              blob.type
            );
          }
        }
      }

      await mutate(matcher => matcher === QueryKey.getWorkspaces);
      // refresh the local storage
      await AffinePlugin.CRUD.list();
      return id;
    },
    delete: async workspace => {
      const items = storage.getItem(kAffineLocal);
      if (
        Array.isArray(items) &&
        items.every(item => schema.safeParse(item).success)
      ) {
        storage.setItem(
          kAffineLocal,
          items.filter(item => item.id !== workspace.id)
        );
      }
      await affineApis.deleteWorkspace({
        id: workspace.id,
      });
      await mutate(matcher => matcher === QueryKey.getWorkspaces);
    },
    get: async workspaceId => {
      try {
        if (!getLoginStorage()) {
          const workspaces = getPersistenceAllWorkspace();
          return (
            workspaces.find(workspace => workspace.id === workspaceId) ?? null
          );
        }
        const workspaces: AffineWorkspace[] = await AffinePlugin.CRUD.list();
        return (
          workspaces.find(workspace => workspace.id === workspaceId) ?? null
        );
      } catch (e) {
        const workspaces = getPersistenceAllWorkspace();
        return (
          workspaces.find(workspace => workspace.id === workspaceId) ?? null
        );
      }
    },
    list: async () => {
      const allWorkspaces = getPersistenceAllWorkspace();
      try {
        const workspaces = await affineApis.getWorkspaces().then(workspaces => {
          return workspaces.map(workspace => {
            const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
              workspace.id,
              (k: string) =>
                // fixme: token could be expired
                ({ api: '/api/workspace', token: getLoginStorage()?.token }[k])
            );
            const dump = workspaces.map(workspace => {
              return {
                id: workspace.id,
                type: workspace.type,
                public: workspace.public,
                permission: workspace.permission,
              } satisfies z.infer<typeof schema>;
            });
            const old = storage.getItem(kAffineLocal);
            if (
              Array.isArray(old) &&
              old.every(item => schema.safeParse(item).success)
            ) {
              const data = [...dump];
              old.forEach((item: z.infer<typeof schema>) => {
                const has = dump.find(dump => dump.id === item.id);
                if (!has) {
                  data.push(item);
                }
              });
              storage.setItem(kAffineLocal, [...data]);
            }

            const affineWorkspace: AffineWorkspace = {
              ...workspace,
              flavour: WorkspaceFlavour.AFFINE,
              blockSuiteWorkspace,
              providers: [...createAffineProviders(blockSuiteWorkspace)],
            };
            return affineWorkspace;
          });
        });
        workspaces.forEach(workspace => {
          const idx = allWorkspaces.findIndex(({ id }) => id === workspace.id);
          if (idx !== -1) {
            allWorkspaces.splice(idx, 1, workspace);
          } else {
            allWorkspaces.push(workspace);
          }
        });

        // only save data when login in
        const dump = allWorkspaces.map(workspace => {
          return {
            id: workspace.id,
            type: workspace.type,
            public: workspace.public,
            permission: workspace.permission,
          } satisfies z.infer<typeof schema>;
        });
        storage.setItem(kAffineLocal, [...dump]);
      } catch (e) {
        console.error('fetch affine workspaces failed', e);
      }
      return [...allWorkspaces];
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
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
            onInit={initPage}
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
