import { workspaceManagerAtom } from '@affine/core/modules/workspace';
import type { WorkspaceMetadata } from '@affine/workspace/metadata';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

export function useWorkspaceBlobObjectUrl(
  meta?: WorkspaceMetadata,
  blobKey?: string | null
) {
  const workspaceManager = useAtomValue(workspaceManagerAtom);

  const [blob, setBlob] = useState<string | undefined>(undefined);

  useEffect(() => {
    setBlob(undefined);
    if (!blobKey || !meta) {
      return;
    }
    let canceled = false;
    let objectUrl: string = '';
    workspaceManager
      .getWorkspaceBlob(meta, blobKey)
      .then(blob => {
        if (blob && !canceled) {
          objectUrl = URL.createObjectURL(blob);
          setBlob(objectUrl);
        }
      })
      .catch(err => {
        console.error('get workspace blob error: ' + err);
      });

    return () => {
      canceled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [meta, blobKey, workspaceManager]);

  return blob;
}
