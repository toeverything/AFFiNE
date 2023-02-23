import { Page } from '@blocksuite/store';
import { useAtom } from 'jotai/index';

import { currentPageIdAtom } from '../../atoms';
import { useCurrentWorkspace } from './use-current-workspace';

export function useCurrentPage(): [
  Page | null,
  (newId: string | null) => void
] {
  const [id, setId] = useAtom(currentPageIdAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  if (currentWorkspace && 'blockSuiteWorkspace' in currentWorkspace) {
    return [
      id ? currentWorkspace.blockSuiteWorkspace.getPage(id) : null,
      setId,
    ];
  }
  return [null, setId];
}
