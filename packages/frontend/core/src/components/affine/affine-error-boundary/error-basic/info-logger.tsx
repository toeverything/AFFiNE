import { Page, WorkspaceListService } from '@toeverything/infra';
import { useService, useServiceOptional } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
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
    useService(CurrentWorkspaceService).currentWorkspace
  );
  const currentPage = useServiceOptional(Page);
  const path = location.pathname;
  const query = useParams();
  useEffect(() => {
    console.info('DumpInfo', {
      path,
      query,
      currentWorkspaceId: currentWorkspace?.id,
      currentPageId: currentPage?.id,
      workspaceList,
    });
  }, [path, query, currentWorkspace, workspaceList, currentPage?.id]);
  return null;
};
