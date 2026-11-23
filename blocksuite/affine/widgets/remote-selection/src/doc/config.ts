import type { BlockModel } from '@blocksuite/store';

export type DocRemoteSelectionConfig = {
  blockSelectionBackgroundTransparent: (block: BlockModel) => boolean;
};
