import { useService } from '@toeverything/infra';
import { useDebouncedState } from 'foxact/use-debounced-state';
import { useEffect } from 'react';

import { WorkspacePropertiesAdapter } from '../../modules/properties';

function getProxy<T extends object>(obj: T) {
  return new Proxy(obj, {});
}

const useReactiveAdapter = (adapter: WorkspacePropertiesAdapter) => {
  // hack: delay proxy creation to avoid unnecessary re-render + render in another component issue
  const [proxy, setProxy] = useDebouncedState(adapter, 0);
  useEffect(() => {
    // TODO(@Peng): track which properties are used and then filter by property path change
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
