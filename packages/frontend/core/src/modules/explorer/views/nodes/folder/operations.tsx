import { MenuIcon, MenuItem } from '@affine/component';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { useI18n } from '@affine/i18n';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useMemo } from 'react';

export const FavoriteFolderOperation = ({ id }: { id: string }) => {
  const t = useI18n();
  const compatibleFavoriteItemsAdapter = useService(
    CompatibleFavoriteItemsAdapter
  );

  const favorite = useLiveData(
    useMemo(() => {
      return compatibleFavoriteItemsAdapter.isFavorite$(id, 'folder');
    }, [compatibleFavoriteItemsAdapter, id])
  );

  return (
    <MenuItem
      preFix={
        <MenuIcon>
          {favorite ? (
            <FavoritedIcon style={{ color: cssVar('primaryColor') }} />
          ) : (
            <FavoriteIcon />
          )}
        </MenuIcon>
      }
      onClick={() => compatibleFavoriteItemsAdapter.toggle(id, 'folder')}
    >
      {favorite
        ? t['com.affine.rootAppSidebar.organize.folder-rm-favorite']()
        : t['com.affine.rootAppSidebar.organize.folder-add-favorite']()}
    </MenuItem>
  );
};
