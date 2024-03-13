import { toast } from '@affine/component';
import {
  type AllPageListConfig,
  FavoriteTag,
} from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { DocMeta } from '@blocksuite/store';
import { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useCallback, useMemo } from 'react';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';
import { usePublicPages } from './use-is-shared-page';

export const useAllPageListConfig = () => {
  const currentWorkspace = useService(Workspace);
  const { getPublicMode } = usePublicPages(currentWorkspace);
  const workspace = currentWorkspace.docCollection;
  const pageMetas = useBlockSuiteDocMeta(workspace);
  const { isPreferredEdgeless } = usePageHelper(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const { toggleFavorite } = useBlockSuiteMetaHelper(
    currentWorkspace.docCollection
  );
  const t = useAFFiNEI18N();
  const onToggleFavoritePage = useCallback(
    (page: DocMeta) => {
      const status = page.favorite;
      toggleFavorite(page.id);
      toast(
        status
          ? t['com.affine.toastMessage.removedFavorites']()
          : t['com.affine.toastMessage.addedFavorites']()
      );
    },
    [t, toggleFavorite]
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
            active={!!page.favorite}
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
    onToggleFavoritePage,
  ]);
};
