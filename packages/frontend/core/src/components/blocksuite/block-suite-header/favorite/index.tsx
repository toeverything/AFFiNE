import { FavoriteTag } from '@affine/core/components/page-list';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { toast } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useCallback } from 'react';

export interface FavoriteButtonProps {
  pageId: string;
}

export const useFavorite = (pageId: string) => {
  const t = useAFFiNEI18N();
  const workspace = useService(Workspace);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const currentPage = blockSuiteWorkspace.getPage(pageId);
  assertExists(currentPage);

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const favorite = pageMeta?.favorite ?? false;

  const { toggleFavorite: _toggleFavorite } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);

  const toggleFavorite = useCallback(() => {
    _toggleFavorite(pageId);
    toast(
      favorite
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favorite, pageId, t, _toggleFavorite]);

  return { favorite, toggleFavorite };
};

export const FavoriteButton = ({ pageId }: FavoriteButtonProps) => {
  const { favorite, toggleFavorite } = useFavorite(pageId);

  return <FavoriteTag active={!!favorite} onClick={toggleFavorite} />;
};
