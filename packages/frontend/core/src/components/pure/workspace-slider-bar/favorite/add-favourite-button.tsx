import { IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { PlusIcon } from '@blocksuite/icons';
import type { DocCollection } from '@blocksuite/store';

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
  const { setDocMeta } = useDocMetaHelper(docCollection);
  const handleAddFavorite = useAsyncCallback(
    async e => {
      if (pageId) {
        e.stopPropagation();
        e.preventDefault();
        createLinkedPage(pageId);
      } else {
        const page = createPage();
        page.load();
        setDocMeta(page.id, { favorite: true });
      }
    },
    [pageId, createLinkedPage, createPage, setDocMeta]
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
