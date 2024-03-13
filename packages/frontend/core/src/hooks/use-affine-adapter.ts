import type { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useDebouncedState } from 'foxact/use-debounced-state';
import { useEffect, useMemo } from 'react';

import { WorkspacePropertiesAdapter } from '../modules/workspace/properties';

function getProxy<T extends object>(obj: T) {
  return new Proxy(obj, {});
}

const useReactiveAdapter = (adapter: WorkspacePropertiesAdapter) => {
  // hack: delay proxy creation to avoid unnecessary re-render + render in another component issue
  const [proxy, setProxy] = useDebouncedState(adapter, 0);
  useEffect(() => {
    // todo: track which properties are used and then filter by property path change
    // using Y.YEvent.path
    function observe() {
      setProxy(getProxy(adapter));
    }
    const disposables: (() => void)[] = [];
    disposables.push(
      adapter.workspace.docCollection.meta.docMetaUpdated.on(observe).dispose
    );
    adapter.properties.observeDeep(observe);
    disposables.push(() => adapter.properties.unobserveDeep(observe));
    return () => {
      for (const dispose of disposables) {
        dispose();
      }
    };
  }, [adapter, setProxy]);

  return proxy;
};

export function useCurrentWorkspacePropertiesAdapter() {
  const adapter = useService(WorkspacePropertiesAdapter);
  return useReactiveAdapter(adapter);
}

export function useWorkspacePropertiesAdapter(workspace: Workspace) {
  const adapter = useMemo(
    () => new WorkspacePropertiesAdapter(workspace),
    [workspace]
  );
  return useReactiveAdapter(adapter);
}
