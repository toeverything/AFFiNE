import { FavoriteTag } from '@affine/core/components/page-list';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { toast } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { assertExists } from '@blocksuite/global/utils';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback } from 'react';

export interface FavoriteButtonProps {
  pageId: string;
}

export const useFavorite = (pageId: string) => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const docCollection = workspace.docCollection;
  const currentPage = docCollection.getDoc(pageId);
  const favAdapter = useService(FavoriteItemsAdapter);
  assertExists(currentPage);

  const favorite = useLiveData(favAdapter.isFavorite$(pageId, 'doc'));

  const toggleFavorite = useCallback(() => {
    favAdapter.toggle(pageId, 'doc');
    toast(
      favorite
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favorite, pageId, t, favAdapter]);

  return { favorite, toggleFavorite };
};

export const FavoriteButton = ({ pageId }: FavoriteButtonProps) => {
  const { favorite, toggleFavorite } = useFavorite(pageId);

  return (
    <FavoriteTag
      data-testid="pin-button"
      active={!!favorite}
      onClick={toggleFavorite}
    />
  );
};
