import { getDataCenter, WorkspaceUnit } from '@affine/datacenter';
import { DataCenter } from '@affine/datacenter';
import { Disposable, DisposableGroup } from '@blocksuite/global/utils';
import type { PageMeta as StorePageMeta } from '@blocksuite/store';
import React, { useEffect } from 'react';
import useSWR from 'swr';

const DEFAULT_WORKSPACE_NAME = 'Demo Workspace';

export const createDefaultWorkspace = async (dataCenter: DataCenter) => {
  return dataCenter.createWorkspace({
    name: DEFAULT_WORKSPACE_NAME,
  });
};

declare global {
  // eslint-disable-next-line no-var
  var dataCenterPromise: Promise<DataCenter>;
  // eslint-disable-next-line no-var
  var dc: DataCenter;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
let dataCenterPromise: Promise<DataCenter> = null!;
if (!globalThis.dataCenterPromise) {
  dataCenterPromise = getDataCenter();
  dataCenterPromise.then(dataCenter => {
    globalThis.dc = dataCenter;
    return dataCenter;
  });
} else {
  dataCenterPromise = globalThis.dataCenterPromise;
}

export { dataCenterPromise };

export interface PageMeta extends StorePageMeta {
  favorite: boolean;
  trash: boolean;
  trashDate: number;
  updatedDate: number;
  mode: 'edgeless' | 'page';
}

import { GlobalActionsCreator, useGlobalStateApi } from '..';

export type DataCenterState = {
  currentDataCenterWorkspace: WorkspaceUnit | null;
  dataCenterPageList: PageMeta[];
  blobDataSynced: boolean;
};

export type DataCenterActions = {
  loadWorkspace: (
    workspaceId: string,
    signal?: AbortSignal
  ) => Promise<WorkspaceUnit | null>;
};

export const createDataCenterState = (): DataCenterState => ({
  currentDataCenterWorkspace: null,
  dataCenterPageList: [],
  blobDataSynced: false,
});

export const createDataCenterActions: GlobalActionsCreator<
  DataCenterActions
> = (set, get) => ({
  loadWorkspace: async (workspaceId, signal) => {
    const dataCenter = await dataCenterPromise;
    const { currentDataCenterWorkspace } = get();
    if (!dataCenter.workspaces.find(v => v.id.toString() === workspaceId)) {
      return null;
    }
    if (workspaceId === currentDataCenterWorkspace?.id) {
      return currentDataCenterWorkspace;
    }
    const workspace = (await dataCenter.loadWorkspace(workspaceId)) ?? null;

    if (signal?.aborted) {
      // do not update state if aborted
      return null;
    }

    let isOwner;
    if (workspace?.provider === 'local') {
      // isOwner is useful only in the cloud
      isOwner = true;
    } else {
      const userInfo = get().user; // We must ensure workspace.owner exists, then ensure id same.
      isOwner = userInfo?.id === workspace?.owner?.id;
    }

    const pageList =
      (workspace?.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]) ?? [];
    if (workspace?.blocksuiteWorkspace) {
      set({
        currentWorkspace: workspace.blocksuiteWorkspace,
      });
    }

    set({
      isOwner,
      currentDataCenterWorkspace: workspace,
      dataCenterPageList: pageList,
    });

    return workspace;
  },
});

export function useDataCenter() {
  const { data } = useSWR<DataCenter>(['datacenter'], {
    fallbackData: DataCenter.initEmpty(),
  });
  return data as DataCenter;
}

export function useDataCenterWorkspace(
  workspaceId: string | null
): WorkspaceUnit | null {
  const { data } = useSWR<WorkspaceUnit | null>(['datacenter', workspaceId], {
    fallbackData: null,
  });
  return data ?? null;
}

export function DataCenterPreloader({ children }: React.PropsWithChildren) {
  const api = useGlobalStateApi();
  //# region effect for updating workspace page list
  useEffect(() => {
    return api.subscribe(
      store => store.currentDataCenterWorkspace,
      currentWorkspace => {
        const disposableGroup = new DisposableGroup();
        disposableGroup.add(
          currentWorkspace?.blocksuiteWorkspace?.meta.pagesUpdated.on(() => {
            if (
              Array.isArray(
                currentWorkspace.blocksuiteWorkspace?.meta.pageMetas
              )
            ) {
              api.setState({
                dataCenterPageList: currentWorkspace.blocksuiteWorkspace?.meta
                  .pageMetas as PageMeta[],
              });
            }
          })
        );
        return () => {
          disposableGroup.dispose();
        };
      }
    );
  }, [api]);
  //# endregion
  //# region effect for blobDataSynced
  useEffect(
    () =>
      api.subscribe(
        store => store.currentDataCenterWorkspace,
        workspace => {
          if (!workspace?.blocksuiteWorkspace) {
            return;
          }
          const controller = new AbortController();
          const blocksuiteWorkspace = workspace.blocksuiteWorkspace;
          let syncChangeDisposable: Disposable | undefined;
          async function subscribe() {
            const blobStorage = await blocksuiteWorkspace.blobs;
            if (controller.signal.aborted) {
              return;
            }
            syncChangeDisposable =
              blobStorage?.signals.onBlobSyncStateChange.on(() => {
                if (controller.signal.aborted) {
                  syncChangeDisposable?.dispose();
                  return;
                } else {
                  api.setState({
                    blobDataSynced: blobStorage?.uploading,
                  });
                }
              });
          }
          subscribe();
          return () => {
            controller.abort();
            syncChangeDisposable?.dispose();
          };
        }
      ),
    [api]
  );
  //# endregion
  return <>{children}</>;
}
