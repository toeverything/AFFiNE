import { IconButton } from '@affine/component/ui/button';
import { PlusIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';

import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';

type AddFavouriteButtonProps = {
  workspace: Workspace;
  pageId?: string;
};

export const AddFavouriteButton = ({
  workspace,
  pageId,
}: AddFavouriteButtonProps) => {
  const { createPage } = usePageHelper(workspace);
  const { setPageMeta } = usePageMetaHelper(workspace);
  const handleAddFavorite = useAsyncCallback(
    async e => {
      if (pageId) {
        e.stopPropagation();
        e.preventDefault();
        const page = createPage();
        await page.load();
        const parentPage = workspace.getPage(pageId);
        if (parentPage) {
          await parentPage.load();
          const text = parentPage.Text.fromDelta([
            {
              insert: ' ',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: page.id,
                },
              },
            },
          ]);
          const [frame] = parentPage.getBlockByFlavour('affine:note');
          frame && parentPage.addBlock('affine:paragraph', { text }, frame.id);
          setPageMeta(page.id, {});
        }
      } else {
        const page = createPage();
        await page.load();
        setPageMeta(page.id, { favorite: true });
      }
    },
    [createPage, setPageMeta, workspace, pageId]
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
