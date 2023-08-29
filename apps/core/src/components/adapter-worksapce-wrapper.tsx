import { assertExists } from '@blocksuite/global/utils';
import type { FC, PropsWithChildren } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';

export const AdapterProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
  const [currentWorkspace] = useCurrentWorkspace();

  const Provider = WorkspaceAdapters[currentWorkspace.flavour].UI.Provider;
  assertExists(Provider);
  return <Provider>{children}</Provider>;
};
