import type { OffsetList } from './types';
export const getTargetIndexByDraggingOffset = (
  offsets: OffsetList,
  draggingIndex: number,
  indicatorLeft: number
) => {
  const originalStart = offsets[draggingIndex];
  const originalWidth = offsets[draggingIndex + 1] - originalStart;
  const indicatorRight = indicatorLeft + originalWidth;
  const isForward = indicatorLeft > originalStart;
  const startIndex = isForward ? draggingIndex + 1 : 0;
  const endIndex = isForward ? offsets.length - 1 : draggingIndex - 1;
  if (isForward) {
    for (let i = endIndex; i >= startIndex; i--) {
      const blockCenter = (offsets[i] + offsets[i + 1]) / 2;
      if (indicatorRight > blockCenter) {
        return {
          targetIndex: i,
          isForward,
        };
      }
    }
  } else {
    for (let i = startIndex; i <= endIndex; i++) {
      const blockCenter = (offsets[i] + offsets[i + 1]) / 2;
      if (indicatorLeft < blockCenter) {
        return {
          targetIndex: i,
          isForward,
        };
      }
    }
  }
  return {
    targetIndex: undefined,
    isForward,
  };
};
