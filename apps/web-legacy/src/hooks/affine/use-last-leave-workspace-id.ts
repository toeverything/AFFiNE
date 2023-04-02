import { useAtomValue } from 'jotai';

import { lastWorkspaceIdAtom } from '../current/use-current-workspace';

export function useLastWorkspaceId() {
  return useAtomValue(lastWorkspaceIdAtom);
}
