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
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerCollectionNode } from '../../nodes/collection';
import { ExplorerDocNode } from '../../nodes/doc';
import { ExplorerFolderNode } from '../../nodes/folder';
import { ExplorerTagNode } from '../../nodes/tag';

export const ExplorerFavorites = () => {
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
    <CollapsibleSection
      name="favorites"
      title={t['com.affine.rootAppSidebar.favorites']()}
      testId="explorer-favorites"
      headerTestId="explorer-favorite-category-divider"
    >
      <ExplorerTreeRoot placeholder={isLoading ? 'Loading' : null}>
        {favorites.map(favorite => (
          <FavoriteNode key={favorite.id} favorite={favorite} />
        ))}
        <AddItemPlaceholder
          data-testid="explorer-bar-add-favorite-button"
          data-event-props="$.navigationPanel.favorites.createDoc"
          data-event-args-control="addFavorite"
          onClick={handleCreateNewFavoriteDoc}
          label={t['New Page']()}
        />
      </ExplorerTreeRoot>
    </CollapsibleSection>
  );
};

export const FavoriteNode = ({
  favorite,
}: {
  favorite: {
    id: string;
    type: FavoriteSupportType;
  };
}) => {
  return favorite.type === 'doc' ? (
    <ExplorerDocNode docId={favorite.id} />
  ) : favorite.type === 'tag' ? (
    <ExplorerTagNode tagId={favorite.id} />
  ) : favorite.type === 'folder' ? (
    <ExplorerFolderNode nodeId={favorite.id} />
  ) : (
    <ExplorerCollectionNode collectionId={favorite.id} />
  );
};
