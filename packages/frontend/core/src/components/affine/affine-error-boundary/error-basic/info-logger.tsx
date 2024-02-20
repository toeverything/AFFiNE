import { WorkspaceListService } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { currentPageIdAtom } from '../../../../atoms/mode';
import { CurrentWorkspaceService } from '../../../../modules/workspace/current-workspace';

export interface DumpInfoProps {
  error: any;
}

export const DumpInfo = (_props: DumpInfoProps) => {
  const location = useLocation();
  const workspaceList = useService(WorkspaceListService);
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );
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
