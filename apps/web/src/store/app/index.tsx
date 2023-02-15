import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { createStore, StateCreator, useStore } from 'zustand';
import { combine, subscribeWithSelector } from 'zustand/middleware';
import type { UseBoundStore } from 'zustand/react';
import {
  BlockSuiteActions,
  BlockSuiteState,
  createBlockSuiteActions,
  createBlockSuiteState,
} from '@/store/app/blocksuite';
import {
  createUserActions,
  createUserState,
  UserActions,
  UserState,
} from '@/store/app/user';
import { DataCenter, getDataCenter } from '@affine/datacenter';
import { createDefaultWorkspace } from '@/providers/app-state-provider/utils';

export type GlobalActionsCreator<Actions, Store = GlobalState> = StateCreator<
  Store,
  [['zustand/subscribeWithSelector', unknown]],
  [],
  Actions
>;

export interface GlobalState extends BlockSuiteState, UserState {
  readonly dataCenter: DataCenter;
  readonly dataCenterPromise: Promise<DataCenter>;
}

export interface GlobalActions extends BlockSuiteActions, UserActions {}

const create = () =>
  createStore(
    subscribeWithSelector(
      combine<GlobalState, GlobalActions>(
        {
          ...createBlockSuiteState(),
          ...createUserState(),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          dataCenter: null!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          dataCenterPromise: null!,
        },
        /* deepscan-disable TOO_MANY_ARGS */
        (set, get, api) => ({
          ...createBlockSuiteActions(set, get, api),
          ...createUserActions(set, get, api),
        })
        /* deepscan-enable TOO_MANY_ARGS */
      )
    )
  );
type Store = ReturnType<typeof create>;

const GlobalStateContext = createContext<Store | null>(null);

export const useGlobalStateApi = () => {
  const api = useContext(GlobalStateContext);
  if (!api) {
    throw new Error('cannot find modal context');
  }
  return api;
};

export const useGlobalState: UseBoundStore<Store> = ((
  selector: Parameters<UseBoundStore<Store>>[0],
  equals: Parameters<UseBoundStore<Store>>[1]
) => {
  const api = useGlobalStateApi();
  return useStore(api, selector, equals);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

export function DataCenterLoader() {
  const dataCenter = useGlobalState(store => store.dataCenter);
  const dataCenterPromise = useGlobalState(store => store.dataCenterPromise);
  const api = useGlobalStateApi();
  if (!dataCenter && !dataCenterPromise) {
    const promise = getDataCenter();
    api.setState({ dataCenterPromise: promise });
    promise.then(async dataCenter => {
      // Ensure datacenter has at least one workspace
      if (dataCenter.workspaces.length === 0) {
        await createDefaultWorkspace(dataCenter);
      }
      api.setState({ dataCenter });
    });
    throw promise;
  }
  if (!dataCenter) {
    throw dataCenterPromise;
  }
  return null;
}

export const GlobalAppProvider: React.FC<React.PropsWithChildren> =
  function ModelProvider({ children }) {
    return (
      <GlobalStateContext.Provider value={useMemo(() => create(), [])}>
        {children}
      </GlobalStateContext.Provider>
    );
  };
