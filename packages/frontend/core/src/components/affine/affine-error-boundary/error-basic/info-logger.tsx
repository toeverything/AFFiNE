import {
  useLiveData,
  useService,
  WorkspaceListService,
} from '@toeverything/infra';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { CurrentWorkspaceService } from '../../../../modules/workspace/current-workspace';

export interface DumpInfoProps {
  error: any;
}

export const DumpInfo = (_props: DumpInfoProps) => {
  const location = useLocation();
  const workspaceList = useService(WorkspaceListService);
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace$
  );
  const path = location.pathname;
  const query = useParams();
  useEffect(() => {
    console.info('DumpInfo', {
      path,
      query,
      currentWorkspaceId: currentWorkspace?.id,
      workspaceList,
    });
  }, [path, query, currentWorkspace, workspaceList]);
  return null;
};
