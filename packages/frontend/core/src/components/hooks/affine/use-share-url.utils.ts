import type { DocMode } from '@blocksuite/affine/model';

export const getDefaultShareMode = (
  currentMode?: DocMode
): DocMode | undefined => {
  return currentMode === 'edgeless' ? 'edgeless' : undefined;
};
