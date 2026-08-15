import { type IconData, IconRenderer, IconType } from '@affine/component';
import { getBlobIconUrl } from '@blocksuite/affine-shared/utils';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import { type ReactNode, type SVGProps, useEffect, useState } from 'react';

import { WorkspaceService } from '../../workspace';
import * as styles from './explorer-icon.css';

/**
 * Resolve a blob id to an object URL, fetching the blob from the workspace
 * blob engine on demand. URLs are cached per blob id and shared across all
 * consumers (see `getBlobIconUrl`); a failed or not-yet-synced fetch is not
 * cached, so the next mount retries it.
 */
export function useBlobIconUrl(blobId?: string): string | undefined {
  const workspaceService = useService(WorkspaceService);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!blobId) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    const blobSync = workspaceService.workspace.docCollection.blobSync;
    getBlobIconUrl(blobId, id => blobSync.get(id))
      .then(resolved => {
        if (!cancelled) setUrl(resolved ?? undefined);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blobId, workspaceService]);

  return url;
}

export const BlobIcon = ({
  blobId,
  fallback,
  className,
  style,
  width,
  height,
}: {
  blobId: string;
  fallback?: ReactNode;
} & SVGProps<SVGSVGElement>) => {
  const url = useBlobIconUrl(blobId);
  if (!url) {
    return fallback ?? null;
  }
  return (
    <img
      src={url}
      alt=""
      className={clsx(styles.blobIcon, className)}
      style={{
        ...(width != null ? { width } : null),
        ...(height != null ? { height } : null),
        ...style,
      }}
    />
  );
};

/**
 * Blob-aware icon renderer for @affine/core. Unlike `IconRenderer` (which
 * lives in @affine/component and cannot reach the blob engine), this renders
 * `IconType.Blob` icons by fetching them from the workspace blob engine.
 */
export const ExplorerIcon = ({
  icon,
  fallback,
  ...props
}: {
  icon?: IconData;
  fallback?: ReactNode;
} & SVGProps<SVGSVGElement>) => {
  if (!icon) {
    return fallback ?? null;
  }
  if (icon.type === IconType.Blob && icon.blobId) {
    return <BlobIcon blobId={icon.blobId} fallback={fallback} {...props} />;
  }
  return <IconRenderer data={icon} fallback={fallback} {...props} />;
};
