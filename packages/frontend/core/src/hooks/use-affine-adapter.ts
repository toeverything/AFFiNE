import type { Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

import type { WorkspacePropertiesAdapter } from '../modules/workspace/properties';
import {
  currentWorkspacePropertiesAdapterAtom,
  workspaceAdapterAtomFamily,
} from '../modules/workspace/properties';

function getProxy<T extends object>(obj: T) {
  return new Proxy(obj, {});
}

const useReactiveAdapter = (adapter: WorkspacePropertiesAdapter) => {
  const [proxy, setProxy] = useState(adapter);

  useEffect(() => {
    // todo: track which properties are used and then filter by property path change
    // using Y.YEvent.path
    function observe() {
      setProxy(getProxy(adapter));
    }
    adapter.properties.observeDeep(observe);
    return () => {
      adapter.properties.unobserveDeep(observe);
    };
  }, [adapter]);

  return proxy;
};

export function useCurrentWorkspacePropertiesAdapter() {
  const adapter = useAtomValue(currentWorkspacePropertiesAdapterAtom);
  return useReactiveAdapter(adapter);
}

export function useWorkspacePropertiesAdapter(workspace: Workspace) {
  const adapter = useAtomValue(workspaceAdapterAtomFamily(workspace));
  return useReactiveAdapter(adapter);
}
