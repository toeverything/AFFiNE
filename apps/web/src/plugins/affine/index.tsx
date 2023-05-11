import { AFFINE_STORAGE_KEY, config, prefixUrl } from '@affine/env';
import { initPage } from '@affine/env/blocksuite';
import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import {
  clearLoginStorage,
  createAffineAuth,
  getLoginStorage,
  isExpired,
  parseIdToken,
  setLoginStorage,
  SignMethod,
} from '@affine/workspace/affine/login';
import { rootStore, rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { AffineWorkspace } from '@affine/workspace/type';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';
import {
  cleanupWorkspace,
  createEmptyBlockSuiteWorkspace,
} from '@affine/workspace/utils';
import { createJSONStorage } from 'jotai/utils';
import type { PropsWithChildren, ReactElement } from 'react';
import { Suspense, useEffect } from 'react';
import { mutate } from 'swr';
import { z } from 'zod';

import { createAffineProviders } from '../../blocksuite';
import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { PageLoading } from '../../components/pure/loading';
import { useAffineRefreshAuthToken } from '../../hooks/affine/use-affine-refresh-auth-token';
import { BlockSuiteWorkspace } from '../../shared';
import { affineApis } from '../../shared/apis';
import { toast } from '../../utils';
import type { WorkspacePlugin } from '..';
import { QueryKey } from './fetcher';

const storage = createJSONStorage(() => localStorage);
const schema = z.object({
  id: z.string(),
  type: z.number(),
  public: z.boolean(),
  permission: z.number(),
});

const getPersistenceAllWorkspace = () => {
  const items = storage.getItem(AFFINE_STORAGE_KEY, []);
  const allWorkspaces: AffineWorkspace[] = [];
  if (
    Array.isArray(items) &&
    items.every(item => schema.safeParse(item).success)
  ) {
    allWorkspaces.push(
      ...items.map((item: z.infer<typeof schema>) => {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          item.id,
          WorkspaceFlavour.AFFINE,
          {
            workspaceApis: affineApis,
          }
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

export const affineAuth = createAffineAuth(prefixUrl);

function AuthContext({ children }: PropsWithChildren): ReactElement {
  const login = useAffineRefreshAuthToken();

  useEffect(() => {
    if (!login) {
      console.warn('No login, redirecting to local workspace page...');
    }
  }, [login]);
  if (!login) {
    return <PageLoading />;
  }
  return <>{children}</>;
}

export const AffinePlugin: WorkspacePlugin<WorkspaceFlavour.AFFINE> = {
  flavour: WorkspaceFlavour.AFFINE,
  loadPriority: LoadPriority.HIGH,
  Events: {
    'workspace:access': async () => {
      if (!config.enableLegacyCloud) {
        console.warn('Legacy cloud is disabled');
        return;
      }
      const response = await affineAuth.generateToken(SignMethod.Google);
      if (response) {
        setLoginStorage(response);
        const user = parseIdToken(response.token);
        rootStore.set(currentAffineUserAtom, user);
      } else {
        toast('Login failed');
      }
    },
    'workspace:revoke': async () => {
      if (!config.enableLegacyCloud) {
        console.warn('Legacy cloud is disabled');
        return;
      }
      rootStore.set(rootWorkspacesMetadataAtom, workspaces =>
        workspaces.filter(
          workspace => workspace.flavour !== WorkspaceFlavour.AFFINE
        )
      );
      storage.removeItem(AFFINE_STORAGE_KEY);
      clearLoginStorage();
      rootStore.set(currentAffineUserAtom, null);
    },
  },
  CRUD: {
    create: async blockSuiteWorkspace => {
      const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdate(
        blockSuiteWorkspace.doc
      );
      const { id } = await affineApis.createWorkspace(binary);
      // fixme: syncing images
      const newWorkspaceId = id;

      await new Promise(resolve => setTimeout(resolve, 1000));
      const blobManager = blockSuiteWorkspace.blobs;
      for (const id of await blobManager.list()) {
        const blob = await blobManager.get(id);
        if (blob) {
          await affineApis.uploadBlob(
            newWorkspaceId,
            await blob.arrayBuffer(),
            blob.type
          );
        }
      }

      await mutate(matcher => matcher === QueryKey.getWorkspaces);
      // refresh the local storage
      await AffinePlugin.CRUD.list();
      return id;
    },
    delete: async workspace => {
      const items = storage.getItem(AFFINE_STORAGE_KEY, []);
      if (
        Array.isArray(items) &&
        items.every(item => schema.safeParse(item).success)
      ) {
        storage.setItem(
          AFFINE_STORAGE_KEY,
          items.filter(item => item.id !== workspace.id)
        );
      }
      await affineApis.deleteWorkspace({
        id: workspace.id,
      });
      await mutate(matcher => matcher === QueryKey.getWorkspaces);
    },
    get: async workspaceId => {
      // fixme(himself65): rewrite the auth logic
      try {
        const loginStorage = getLoginStorage();
        if (
          loginStorage == null ||
          isExpired(parseIdToken(loginStorage.token))
        ) {
          rootStore.set(currentAffineUserAtom, null);
          storage.removeItem(AFFINE_STORAGE_KEY);
          cleanupWorkspace(WorkspaceFlavour.AFFINE);
          return null;
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
      const loginStorage = getLoginStorage();
      // fixme(himself65): rewrite the auth logic
      try {
        if (
          loginStorage == null ||
          isExpired(parseIdToken(loginStorage.token))
        ) {
          rootStore.set(currentAffineUserAtom, null);
          storage.removeItem(AFFINE_STORAGE_KEY);
          return [];
        }
      } catch (e) {
        storage.removeItem(AFFINE_STORAGE_KEY);
        return [];
      }
      try {
        const workspaces = await affineApis.getWorkspaces().then(workspaces => {
          return workspaces.map(workspace => {
            const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
              workspace.id,
              WorkspaceFlavour.AFFINE,
              {
                workspaceApis: affineApis,
              }
            );
            const dump = workspaces.map(workspace => {
              return {
                id: workspace.id,
                type: workspace.type,
                public: workspace.public,
                permission: workspace.permission,
              } satisfies z.infer<typeof schema>;
            });
            const old = storage.getItem(AFFINE_STORAGE_KEY, []);
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
              storage.setItem(AFFINE_STORAGE_KEY, [...data]);
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
        storage.setItem(AFFINE_STORAGE_KEY, [...dump]);
      } catch (e) {
        console.error('fetch affine workspaces failed', e);
      }
      return [...allWorkspaces];
    },
  },
  UI: {
    Provider: ({ children }) => {
      return (
        <Suspense fallback={<PageLoading />}>
          <AuthContext>{children}</AuthContext>
        </Suspense>
      );
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
            workspace={currentWorkspace}
            onInit={initPage}
          />
        </>
      );
    },
    PageList: ({ blockSuiteWorkspace, onOpenPage }) => {
      return (
        <BlockSuitePageList
          listType="all"
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
