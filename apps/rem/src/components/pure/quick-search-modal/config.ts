import { useTranslation } from '@affine/i18n';
import {
  DeleteTemporarilyIcon,
  FavoriteIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import { FC, SVGProps, useMemo } from 'react';

import { paths } from '../../../shared';
export const useSwitchToConfig = (
  workspaceId: string
): {
  title: string;
  href: string;
  icon: FC<SVGProps<SVGSVGElement>>;
}[] => {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        title: t('All pages'),
        href: paths.all(workspaceId),
        icon: FolderIcon,
      },
      {
        title: t('Favorites'),
        href: paths.favorite(workspaceId),
        icon: FavoriteIcon,
      },
      {
        title: t('Workspace Settings'),
        href: paths.setting(workspaceId),
        icon: SettingsIcon,
      },
      {
        title: t('Trash'),
        href: paths.trash(workspaceId),
        icon: DeleteTemporarilyIcon,
      },
    ],
    [workspaceId, t]
  );
};
