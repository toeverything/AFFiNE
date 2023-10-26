import { toast } from '@affine/component';
import {
  type AllPageListConfig,
  FavoriteTag,
} from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useCallback, useMemo } from 'react';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { useCurrentWorkspace } from '../current/use-current-workspace';
import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';

export const useAllPageListConfig = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const workspace = currentWorkspace.blockSuiteWorkspace;
  const pageMetas = useBlockSuitePageMeta(workspace);
  const { isPreferredEdgeless } = usePageHelper(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const { toggleFavorite } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const t = useAFFiNEI18N();
  const onToggleFavoritePage = useCallback(
    (page: PageMeta) => {
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
      workspace: currentWorkspace.blockSuiteWorkspace,
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
    currentWorkspace.blockSuiteWorkspace,
    isPreferredEdgeless,
    pageMetas,
    pageMap,
    onToggleFavoritePage,
  ]);
};
