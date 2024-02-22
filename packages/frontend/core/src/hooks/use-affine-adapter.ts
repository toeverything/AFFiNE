import type { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { use } from 'foxact/use';
import { useEffect, useMemo, useState } from 'react';

import { WorkspacePropertiesAdapter } from '../modules/workspace/properties';
import { useBlockSuitePageMeta } from './use-block-suite-page-meta';

function getProxy<T extends object>(obj: T) {
  return new Proxy(obj, {});
}

const useReactiveAdapter = (adapter: WorkspacePropertiesAdapter) => {
  use(adapter.workspace.blockSuiteWorkspace.doc.whenSynced);
  const [proxy, setProxy] = useState(adapter);
  // fixme: this is a hack to force re-render when default meta changed
  useBlockSuitePageMeta(adapter.workspace.blockSuiteWorkspace);
  useEffect(() => {
    // todo: track which properties are used and then filter by property path change
    // using Y.YEvent.path
    function observe() {
      requestAnimationFrame(() => {
        setProxy(getProxy(adapter));
      });
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

export function useWorkspacePropertiesAdapter(workspace: Workspace) {
  const adapter = useMemo(
    () => new WorkspacePropertiesAdapter(workspace),
    [workspace]
  );
  return useReactiveAdapter(adapter);
}
