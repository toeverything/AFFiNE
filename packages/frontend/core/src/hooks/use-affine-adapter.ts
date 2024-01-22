import type { Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useReducer } from 'react';

import {
  currentWorkspacePropertiesAdapterAtom,
  WorkspacePropertiesAdapter,
} from '../modules/workspace/properties';

const useReactiveAdapter = (adapter: WorkspacePropertiesAdapter) => {
  const [, forceUpdate] = useReducer(c => c + 1, 0);

  useEffect(() => {
    // todo: track which properties are used and then filter by property path change
    // using Y.YEvent.path
    function observe() {
      forceUpdate();
    }
    adapter.properties.observeDeep(observe);
    return () => {
      adapter.properties.unobserveDeep(observe);
    };
  }, [adapter]);

  return adapter;
};

export function useCurrentWorkspacePropertiesAdapter() {
  const adapter = useAtomValue(currentWorkspacePropertiesAdapterAtom);
  return useReactiveAdapter(adapter);
}

export function useWorkspacePropertiesAdapter(workspace: Workspace) {
  const adapter = useMemo(
    () => new WorkspacePropertiesAdapter(workspace),
    [workspace]
  );
  return useReactiveAdapter(adapter);
}
