import type { DocCollection } from '@blocksuite/store';

export type FavoriteListProps = {
  docCollection: DocCollection;
};

export type CollectionsListProps = {
  docCollection: DocCollection;
  onCreate?: () => void;
};
