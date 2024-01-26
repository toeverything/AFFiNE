import { workspaceQuotaQuery } from '@affine/graphql';
import bytes from 'bytes';
import { useCallback } from 'react';

import { useQuery } from './use-query';

export const useWorkspaceQuota = (workspaceId: string) => {
  const { data } = useQuery({
    query: workspaceQuotaQuery,
    variables: {
      id: workspaceId,
    },
  });

  const changeToHumanReadable = useCallback((value: string | number) => {
    return bytes.format(bytes.parse(value));
  }, []);

  const quotaData = data.workspace.quota;
  const humanReadableUsedSize = changeToHumanReadable(
    quotaData.usedSize.toString()
  );

  return {
    blobLimit: quotaData.blobLimit,
    storageQuota: quotaData.storageQuota,
    usedSize: quotaData.usedSize,
    humanReadable: {
      name: quotaData.humanReadable.name,
      blobLimit: quotaData.humanReadable.blobLimit,
      storageQuota: quotaData.humanReadable.storageQuota,
      usedSize: humanReadableUsedSize,
    },
  };
};
