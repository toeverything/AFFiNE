import { useService } from '@toeverything/infra/di';
import { useEffect, useState } from 'react';

import { WorkspacePropertiesAdapter } from '../modules/workspace/properties';

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
  const adapter = useService(WorkspacePropertiesAdapter);
  return useReactiveAdapter(adapter);
}
