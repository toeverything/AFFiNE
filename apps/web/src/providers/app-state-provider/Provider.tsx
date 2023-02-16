import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AppStateContext } from './interface';
import type { Disposable } from '@blocksuite/global/utils';
import { useGlobalState } from '@/store/app';

type AppStateContextProps = PropsWithChildren<Record<string, unknown>>;

export const AppState = createContext<AppStateContext>({} as AppStateContext);

export const useAppState = () => useContext(AppState);
export const AppStateProvider = ({
  children,
}: PropsWithChildren<AppStateContextProps>) => {
  const currentDataCenterWorkspace = useGlobalState(
    store => store.currentDataCenterWorkspace
  );
  const [blobState, setBlobState] = useState(false);

  useEffect(() => {
    let syncChangeDisposable: Disposable | undefined;
    const currentWorkspace = currentDataCenterWorkspace;
    if (!currentWorkspace) {
      return;
    }
    const getBlobStorage = async () => {
      const blobStorage = await currentWorkspace?.blocksuiteWorkspace?.blobs;
      syncChangeDisposable = blobStorage?.signals.onBlobSyncStateChange.on(
        () => {
          setBlobState(blobStorage?.uploading);
        }
      );
    };
    getBlobStorage();
    return () => {
      syncChangeDisposable?.dispose();
    };
  }, [currentDataCenterWorkspace]);

  return (
    <AppState.Provider
      value={{
        blobDataSynced: blobState,
      }}
    >
      {children}
    </AppState.Provider>
  );
};
