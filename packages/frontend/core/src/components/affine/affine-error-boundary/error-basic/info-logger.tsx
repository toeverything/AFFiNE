import {
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

export interface DumpInfoProps {
  error: any;
}

export const DumpInfo = (_props: DumpInfoProps) => {
  const location = useLocation();
  const currentWorkspaceId = useLiveData(
    useService(GlobalContextService).globalContext.workspaceId.$
  );
  const path = location.pathname;
  const query = useParams();
  useEffect(() => {
    console.info('DumpInfo', {
      path,
      query,
      currentWorkspaceId: currentWorkspaceId,
    });
  }, [path, query, currentWorkspaceId]);
  return null;
};
