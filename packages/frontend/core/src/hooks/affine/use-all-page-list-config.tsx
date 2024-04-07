import { toast } from '@affine/component';
import type { AllPageListConfig } from '@affine/core/components/page-list';
import { FavoriteTag } from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { usePublicPages } from './use-is-shared-page';

export const useAllPageListConfig = () => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const { getPublicMode } = usePublicPages(currentWorkspace);
  const workspace = currentWorkspace.docCollection;
  const pageMetas = useBlockSuiteDocMeta(workspace);
  const { isPreferredEdgeless } = usePageHelper(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const favAdapter = useService(FavoriteItemsAdapter);
  const t = useAFFiNEI18N();
  const favoriteItems = useLiveData(favAdapter.favorites$);

  const isActive = useCallback(
    (page: DocMeta) => {
      return favoriteItems.some(fav => fav.id === page.id);
    },
    [favoriteItems]
  );
  const onToggleFavoritePage = useCallback(
    (page: DocMeta) => {
      const status = isActive(page);
      favAdapter.toggle(page.id, 'doc');
      toast(
        status
          ? t['com.affine.toastMessage.removedFavorites']()
          : t['com.affine.toastMessage.addedFavorites']()
      );
    },
    [favAdapter, isActive, t]
  );

  return useMemo<AllPageListConfig>(() => {
    return {
      allPages: pageMetas,
      isEdgeless: isPreferredEdgeless,
      getPublicMode,
      docCollection: currentWorkspace.docCollection,
      getPage: id => pageMap[id],
      favoriteRender: page => {
        return (
          <FavoriteTag
            style={{ marginRight: 8 }}
            onClick={() => onToggleFavoritePage(page)}
            active={isActive(page)}
          />
        );
      },
    };
  }, [
    pageMetas,
    isPreferredEdgeless,
    getPublicMode,
    currentWorkspace.docCollection,
    pageMap,
    isActive,
    onToggleFavoritePage,
  ]);
};
