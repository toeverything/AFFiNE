import type { DeleteCollectionInfo } from '@affine/env/filter';
import type { DocCollection } from '@blocksuite/store';

export type FavoriteListProps = {
  docCollection: DocCollection;
};

export type CollectionsListProps = {
  docCollection: DocCollection;
  info: DeleteCollectionInfo;
  onCreate?: () => void;
};
