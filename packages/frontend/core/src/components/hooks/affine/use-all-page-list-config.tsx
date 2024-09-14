import { toast } from '@affine/component';
import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import type { AllPageListConfig } from '@affine/core/components/page-list';
import { FavoriteTag } from '@affine/core/components/page-list';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import { PublicPageMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo } from 'react';

/**
 * @deprecated very poor performance
 */
export const useAllPageListConfig = () => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const shareDocsListService = useService(ShareDocsListService);
  const shareDocs = useLiveData(shareDocsListService.shareDocs?.list$);

  useEffect(() => {
    // TODO(@eyhn): loading & error UI
    shareDocsListService.shareDocs?.revalidate();
  }, [shareDocsListService]);

  const workspace = currentWorkspace.docCollection;
  const pageMetas = useBlockSuiteDocMeta(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const t = useI18n();
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
      getPublicMode(id) {
        const mode = shareDocs?.find(shareDoc => shareDoc.id === id)?.mode;
        if (mode === PublicPageMode.Edgeless) {
          return 'edgeless';
        } else if (mode === PublicPageMode.Page) {
          return 'page';
        } else {
          return undefined;
        }
      },
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
    currentWorkspace.docCollection,
    shareDocs,
    pageMap,
    isActive,
    onToggleFavoritePage,
  ]);
};
