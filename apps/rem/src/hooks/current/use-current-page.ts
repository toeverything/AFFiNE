import { useAtom } from 'jotai/index';

import { currentPageId } from '../../atoms';
import { useCurrentWorkspace } from './use-current-workspace';

export function useCurrentPage() {
  const [id, setId] = useAtom(currentPageId);
  const [currentWorkspace] = useCurrentWorkspace();
  return [
    currentWorkspace?.firstBinarySynced && id
      ? currentWorkspace.blockSuiteWorkspace.getPage(id)
      : null,
    setId,
  ] as const;
}
