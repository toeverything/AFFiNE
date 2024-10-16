import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  ExplorerService,
  ExplorerTreeRoot,
} from '@affine/core/modules/explorer';
import type { FavoriteSupportType } from '@affine/core/modules/favorite';
import { FavoriteService } from '@affine/core/modules/favorite';
import { useI18n } from '@affine/i18n';
import {
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useCallback } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { MobileCollapsibleSection } from '../../layouts/collapsible-section';
import { MobileExplorerCollectionNode } from '../../nodes/collection';
import { MobileExplorerDocNode } from '../../nodes/doc';
import { MobileExplorerFolderNode } from '../../nodes/folder';
import { MobileExplorerTagNode } from '../../nodes/tag';

export const MobileExplorerFavorites = () => {
  const { favoriteService, workspaceService, explorerService } = useServices({
    FavoriteService,
    WorkspaceService,
    ExplorerService,
  });

  const t = useI18n();
  const explorerSection = explorerService.sections.favorites;
  const favorites = useLiveData(favoriteService.favoriteList.sortedList$);
  const isLoading = useLiveData(favoriteService.favoriteList.isLoading$);
  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );

  const handleCreateNewFavoriteDoc = useCallback(() => {
    const newDoc = createPage();
    favoriteService.favoriteList.add(
      'doc',
      newDoc.id,
      favoriteService.favoriteList.indexAt('before')
    );
    explorerSection.setCollapsed(false);
  }, [createPage, explorerSection, favoriteService.favoriteList]);

  return (
    <MobileCollapsibleSection
      name="favorites"
      title={t['com.affine.rootAppSidebar.favorites']()}
      testId="explorer-favorites"
      headerTestId="explorer-favorite-category-divider"
    >
      <ExplorerTreeRoot placeholder={isLoading ? 'Loading' : null}>
        {favorites.map(favorite => (
          <MobileFavoriteNode key={favorite.id} favorite={favorite} />
        ))}
        <AddItemPlaceholder
          data-testid="explorer-bar-add-favorite-button"
          data-event-props="$.navigationPanel.favorites.createDoc"
          data-event-args-control="addFavorite"
          onClick={handleCreateNewFavoriteDoc}
          label={t['New Page']()}
        />
      </ExplorerTreeRoot>
    </MobileCollapsibleSection>
  );
};

export const MobileFavoriteNode = ({
  favorite,
}: {
  favorite: {
    id: string;
    type: FavoriteSupportType;
  };
}) => {
  return favorite.type === 'doc' ? (
    <MobileExplorerDocNode docId={favorite.id} />
  ) : favorite.type === 'tag' ? (
    <MobileExplorerTagNode tagId={favorite.id} />
  ) : favorite.type === 'folder' ? (
    <MobileExplorerFolderNode nodeId={favorite.id} />
  ) : (
    <MobileExplorerCollectionNode collectionId={favorite.id} />
  );
};
