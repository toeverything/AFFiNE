import { toast } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback, useMemo } from 'react';

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
  // to generate a private url like https://affine.app/workspace/123/456
  // to generate a public url like https://affine.app/share/123/456
  // or https://affine.app/share/123/456?mode=edgeless

  const url = new URL(
    `${runtimeConfig.serverUrlPrefix}/${urlType}/${workspaceId}/${pageId}`
  );
  return url.toString();
};

export const useSharingUrl = ({
  workspaceId,
  pageId,
  urlType,
}: UseSharingUrl) => {
  const t = useAFFiNEI18N();
  const sharingUrl = useMemo(
    () => generateUrl({ workspaceId, pageId, urlType }),
    [workspaceId, pageId, urlType]
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
