import { UNTITLED_WORKSPACE_NAME } from '@affine/env';
import { assertExists } from '@blocksuite/store';
import { useCallback, useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceName(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  const [name, set] = useState(
    () => blockSuiteWorkspace?.meta.name ?? UNTITLED_WORKSPACE_NAME
  );
  useEffect(() => {
    if (blockSuiteWorkspace) {
      set(blockSuiteWorkspace.meta.name ?? '');
      const dispose = blockSuiteWorkspace.meta.commonFieldsUpdated.on(() => {
        set(blockSuiteWorkspace.meta.name ?? '');
      });
      return () => {
        dispose.dispose();
      };
    }
  }, [blockSuiteWorkspace]);
  const setName = useCallback(
    (name: string) => {
      assertExists(blockSuiteWorkspace);
      blockSuiteWorkspace.meta.setName(name);
      set(name);
    },
    [blockSuiteWorkspace]
  );
  return [name, setName] as const;
}
