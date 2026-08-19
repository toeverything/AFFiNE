import type { ReactNode, SVGProps } from 'react';

import { AffineIconRenderer } from './renderer/affine-icon';
import { type IconData, IconType } from './type';

export const IconRenderer = ({
  data,
  fallback,
  ...props
}: {
  data?: IconData;
  fallback?: ReactNode;
} & SVGProps<SVGSVGElement>) => {
  if (!data) {
    return fallback ?? null;
  }

  if (data.type === IconType.Emoji && data.unicode) {
    return data.unicode;
  }
  if (data.type === IconType.AffineIcon && data.name) {
    return (
      <AffineIconRenderer name={data.name} color={data.color} {...props} />
    );
  }
  // IconType.Blob is rendered by the blob-aware `ExplorerIcon` in @affine/core,
  // which has access to the workspace blob engine. This component (in
  // @affine/component) cannot fetch blobs, so it falls back here.
  return fallback ?? null;
};
