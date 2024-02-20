import { IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { PlusIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';

import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';

type AddFavouriteButtonProps = {
  workspace: Workspace;
  pageId?: string;
};

export const AddFavouriteButton = ({
  workspace,
  pageId,
}: AddFavouriteButtonProps) => {
  const { createPage, createLinkedPage } = usePageHelper(workspace);
  const { setPageMeta } = usePageMetaHelper(workspace);
  const handleAddFavorite = useAsyncCallback(
    async e => {
      if (pageId) {
        e.stopPropagation();
        e.preventDefault();
        createLinkedPage(pageId);
      } else {
        const page = createPage();
        page.load();
        setPageMeta(page.id, { favorite: true });
      }
    },
    [pageId, createLinkedPage, createPage, setPageMeta]
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
