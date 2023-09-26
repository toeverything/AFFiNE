import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback, useMemo } from 'react';

import { toast } from '../../ui/toast';

type UrlType = 'share' | 'workspace';

type UseSharingUrl = {
  workspaceId: string;
  pageId: string;
  urlType: UrlType;
};

export const generateUrl = ({
  workspaceId,
  pageId,
  urlType,
}: UseSharingUrl) => {
  return `${runtimeConfig.serverUrlPrefix}/${urlType}/${workspaceId}/${pageId}`;
};

export const useSharingUrl = ({
  workspaceId,
  pageId,
  urlType,
}: UseSharingUrl) => {
  const t = useAFFiNEI18N();
  const sharingUrl = useMemo(
    () => generateUrl({ workspaceId, pageId, urlType }),
    [urlType, workspaceId, pageId]
  );

  const onClickCopyLink = useCallback(() => {
    navigator.clipboard
      .writeText(sharingUrl)
      .then(() => {
        toast(t['Copied link to clipboard']());
      })
      .catch(err => {
        console.error(err);
      });
  }, [sharingUrl, t]);

  return {
    sharingUrl,
    onClickCopyLink,
  };
};
