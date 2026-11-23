import type { PageSize } from '@affine/core/modules/pdf/renderer/types';

export function fitToPage(
  viewportInfo: PageSize,
  actualSize: PageSize,
  maxSize: PageSize,
  isThumbnail?: boolean
) {
  const { width: vw, height: vh } = viewportInfo;
  const { width: w, height: h } = actualSize;
  const { width: mw, height: mh } = maxSize;
  let width = 0;
  let height = 0;
  if (h / w > vh / vw) {
    height = vh * (h / mh);
    width = (w / h) * height;
  } else {
    const t = isThumbnail ? Math.min(w / h, 1) : w / mw;
    width = vw * t;
    height = (h / w) * width;
  }
  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
    aspectRatio: width / height,
  };
}
