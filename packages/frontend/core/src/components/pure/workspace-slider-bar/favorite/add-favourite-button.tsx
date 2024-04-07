import { IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { PlusIcon } from '@blocksuite/icons';
import type { DocCollection } from '@blocksuite/store';
import { useService } from '@toeverything/infra';

import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';

type AddFavouriteButtonProps = {
  docCollection: DocCollection;
  pageId?: string;
};

export const AddFavouriteButton = ({
  docCollection,
  pageId,
}: AddFavouriteButtonProps) => {
  const { createPage, createLinkedPage } = usePageHelper(docCollection);
  const favAdapter = useService(FavoriteItemsAdapter);
  const handleAddFavorite = useAsyncCallback(
    async e => {
      if (pageId) {
        e.stopPropagation();
        e.preventDefault();
        createLinkedPage(pageId);
      } else {
        const page = createPage();
        page.load();
        favAdapter.set(page.id, 'doc', true);
      }
    },
    [pageId, createLinkedPage, createPage, favAdapter]
  );

  return (
    <IconButton
      data-testid="slider-bar-add-favorite-button"
      onClick={handleAddFavorite}
      size="small"
    >
      <PlusIcon />
    </IconButton>
  );
};
