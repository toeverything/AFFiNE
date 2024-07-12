import { IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { TelemetryWorkspaceContextService } from '@affine/core/modules/telemetry/services/telemetry';
import { mixpanel } from '@affine/core/utils';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useService, useServices, WorkspaceService } from '@toeverything/infra';

import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';

type AddFavouriteButtonProps = {
  pageId?: string;
};

export const AddFavouriteButton = ({ pageId }: AddFavouriteButtonProps) => {
  const { workspaceService } = useServices({
    WorkspaceService,
  });
  const { createPage, createLinkedPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const favAdapter = useService(FavoriteItemsAdapter);
  const telemetry = useService(TelemetryWorkspaceContextService);
  const handleAddFavorite = useAsyncCallback(
    async e => {
      const page = telemetry.getPageContext();

      if (pageId) {
        e.stopPropagation();
        e.preventDefault();
        createLinkedPage(pageId);
        mixpanel.track('DocCreated', {
          // page:
          segment: 'all doc',
          module: 'favorite',
          control: 'new fav sub doc',
          type: 'doc',
          category: 'page',
          page: page,
        });
      } else {
        const page = createPage();
        page.load();
        favAdapter.set(page.id, 'doc', true);
        mixpanel.track('DocCreated', {
          // page:
          segment: 'all doc',
          module: 'favorite',
          control: 'new fav doc',
          type: 'doc',
          category: 'page',
          page: page,
        });
      }
    },
    [telemetry, pageId, createLinkedPage, createPage, favAdapter]
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
