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
  createDataCenterActions,
  createDataCenterState,
  DataCenterActions,
  DataCenterState,
} from '@/store/app/datacenter';
import {
  createUserActions,
  createUserState,
  UserActions,
  UserState,
} from '@/store/app/user';

export type GlobalActionsCreator<Actions, Store = GlobalState> = StateCreator<
  Store,
  [['zustand/subscribeWithSelector', unknown]],
  [],
  Actions
>;

export interface GlobalState
  extends BlockSuiteState,
    UserState,
    DataCenterState {}

export interface GlobalActions
  extends BlockSuiteActions,
    UserActions,
    DataCenterActions {}

const create = () =>
  createStore(
    subscribeWithSelector(
      combine<GlobalState, GlobalActions>(
        {
          ...createBlockSuiteState(),
          ...createUserState(),
          ...createDataCenterState(),
        },
        /* deepscan-disable TOO_MANY_ARGS */
        (set, get, api) => ({
          ...createBlockSuiteActions(set, get, api),
          ...createUserActions(set, get, api),
          ...createDataCenterActions(set, get, api),
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

export const GlobalAppProvider: React.FC<React.PropsWithChildren> =
  function ModelProvider({ children }) {
    return (
      <GlobalStateContext.Provider value={useMemo(() => create(), [])}>
        {children}
      </GlobalStateContext.Provider>
    );
  };
