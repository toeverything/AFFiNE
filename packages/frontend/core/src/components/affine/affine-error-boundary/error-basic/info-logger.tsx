import {
  currentWorkspaceAtom,
  workspaceListAtom,
} from '@affine/workspace/atom';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { currentPageIdAtom } from '../../../../atoms/mode';

export interface DumpInfoProps {
  error: any;
}

export const DumpInfo = (_props: DumpInfoProps) => {
  const location = useLocation();
  const workspaceList = useAtomValue(workspaceListAtom);
  const currentWorkspace = useAtomValue(currentWorkspaceAtom);
  const currentPageId = useAtomValue(currentPageIdAtom);
  const path = location.pathname;
  const query = useParams();
  useEffect(() => {
    console.info('DumpInfo', {
      path,
      query,
      currentWorkspaceId: currentWorkspace?.id,
      currentPageId,
      workspaceList,
    });
  }, [path, query, currentWorkspace, currentPageId, workspaceList]);
  return null;
};
