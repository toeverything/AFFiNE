import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { atom } from 'jotai';

import { getBlockSuiteWorkspaceAtom } from '../__internal__/workspace';

export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
export const currentWorkspaceAtom = atom<Promise<Workspace>>(async get => {
  const workspaceId = get(currentWorkspaceIdAtom);
  assertExists(workspaceId);
  const [currentWorkspaceAtom] = getBlockSuiteWorkspaceAtom(workspaceId);
  return get(currentWorkspaceAtom);
});
