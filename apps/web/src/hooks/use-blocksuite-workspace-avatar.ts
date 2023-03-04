import { assertExists } from '@blocksuite/store';
import { useCallback, useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceAvatar(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  const [avatar, set] = useState<string | undefined>(
    () => blockSuiteWorkspace?.meta.avatar
  );
  useEffect(() => {
    if (blockSuiteWorkspace) {
      set(blockSuiteWorkspace.meta.avatar);
      const dispose = blockSuiteWorkspace.meta.commonFieldsUpdated.on(() => {
        set(blockSuiteWorkspace.meta.avatar);
      });
      return () => {
        dispose.dispose();
      };
    }
  }, [blockSuiteWorkspace]);
  const setAvatar = useCallback(
    (avatar: string) => {
      assertExists(blockSuiteWorkspace);
      blockSuiteWorkspace.meta.setAvatar(avatar);
      set(avatar);
    },
    [blockSuiteWorkspace]
  );
  return [avatar, setAvatar] as const;
}
