'use client';
import { useAtomValue } from 'jotai';

import { jotaiWorkspacesAtom } from '../../atom';

export const CurrentWorkspace = () => {
  const workspaces = useAtomValue(jotaiWorkspacesAtom);
  return <div>Current Workspace</div>;
};
