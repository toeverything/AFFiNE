import { useAtom } from 'jotai/index';

import { currentWorkspaceIdAtom } from '../../atoms';
import { useWorkspace } from '../use-workspace';

export function useCurrentWorkspace() {
  const [id, setId] = useAtom(currentWorkspaceIdAtom);
  return [useWorkspace(id), setId] as const;
}
