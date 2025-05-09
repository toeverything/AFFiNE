import { toast } from '@affine/component';
import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import { FavoriteTag } from '@affine/core/components/page-list/components/favorite-tag';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { PublicDocMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import type { DocMeta, Workspace } from '@blocksuite/affine/store';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';

export type AllPageListConfig = {
  allPages: DocMeta[];
  docCollection: Workspace;
  /**
   * Return `undefined` if the page is not public
   */
  getPublicMode: (id: string) => undefined | 'page' | 'edgeless';
  getPage: (id: string) => DocMeta | undefined;
  favoriteRender: (page: DocMeta) => ReactNode;
};

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
        if (mode === PublicDocMode.Edgeless) {
          return 'edgeless';
        } else if (mode === PublicDocMode.Page) {
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
