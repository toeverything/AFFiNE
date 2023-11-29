import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

export interface DumpInfoProps {
  error: any;
}

export const DumpInfo = (_props: DumpInfoProps) => {
  const location = useLocation();
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const currentPageId = useAtomValue(currentPageIdAtom);
  const path = location.pathname;
  const query = useParams();
  useEffect(() => {
    console.info('DumpInfo', {
      path,
      query,
      currentWorkspaceId,
      currentPageId,
      metadata,
    });
  }, [path, query, currentWorkspaceId, currentPageId, metadata]);
  return null;
};
