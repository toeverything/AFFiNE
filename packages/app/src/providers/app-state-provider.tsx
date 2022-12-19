import { createContext, useMemo, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  authorizationEvent,
  AccessTokenMessage,
  getWorkspaces,
} from '@pathfinder/data-services';
import type { Workspace } from '@pathfinder/data-services';

interface AppStateValue {
  user: AccessTokenMessage | null;
  workspaces: Workspace[];
}

interface AppStateContext extends AppStateValue {
  setState: (state: AppStateValue) => void;
}

const AppState = createContext<AppStateContext>({
  user: null,
  workspaces: [],
  setState: () => {},
});

export const AppStateProvider = ({ children }: { children?: ReactNode }) => {
  const [state, setState] = useState<AppStateValue>({
    user: null,
    workspaces: [],
  });

  useEffect(() => {
    const callback = async (user: AccessTokenMessage | null) => {
      const workspaces = user ? await getWorkspaces() : [];
      setState(state => ({ ...state, user: user, workspaces }));
    };
    authorizationEvent.onChange(callback);

    return () => {
      authorizationEvent.removeCallback(callback);
    };
  }, []);

  const context = useMemo(
    () => ({
      ...state,
      setState,
    }),
    [state, setState]
  );

  return <AppState.Provider value={context}>{children}</AppState.Provider>;
};

export const useAppState = () => {
  const state = useContext(AppState);
  return state;
};
