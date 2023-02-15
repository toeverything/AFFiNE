import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
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

function DataCenterSideEffect() {
  const onceRef = useRef(true);
  const api = useGlobalStateApi();
  useEffect(() => {
    async function init() {
      const dataCenterPromise = getDataCenter();
      dataCenterPromise.then(async dataCenter => {
        // Ensure datacenter has at least one workspace
        if (dataCenter.workspaces.length === 0) {
          await createDefaultWorkspace(dataCenter);
        }
        api.setState({ dataCenter });
      });
    }
    if (onceRef.current) {
      onceRef.current = false;
      init().then(() => {
        console.log('datacenter init success');
      });
    }
  }, [api]);
  return null;
}

export const GlobalAppProvider: React.FC<React.PropsWithChildren> =
  function ModelProvider({ children }) {
    return (
      <GlobalStateContext.Provider value={useMemo(() => create(), [])}>
        <DataCenterSideEffect />
        {children}
      </GlobalStateContext.Provider>
    );
  };
