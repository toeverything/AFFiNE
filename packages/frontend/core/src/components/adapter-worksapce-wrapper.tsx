import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { useAtomValue } from 'jotai';
import type { FC, PropsWithChildren } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';

export const AdapterProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

  const Provider = WorkspaceAdapters[currentWorkspace.flavour].UI.Provider;
  assertExists(Provider);
  return <Provider>{children}</Provider>;
};
