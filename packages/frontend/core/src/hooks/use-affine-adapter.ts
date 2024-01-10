import { useAtomValue } from 'jotai';
import { useEffect, useReducer } from 'react';

import { currentWorkspacePropertiesAdapterAtom } from '../modules/workspace';

export function useWorkspacePropertiesAdapter() {
  const adapter = useAtomValue(currentWorkspacePropertiesAdapterAtom);
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
}
