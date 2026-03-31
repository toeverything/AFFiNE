import type { DocMode } from '@blocksuite/affine/model';

export const getDefaultShareMode = (currentMode?: DocMode): DocMode => {
  return currentMode === 'edgeless' ? 'edgeless' : 'page';
};
