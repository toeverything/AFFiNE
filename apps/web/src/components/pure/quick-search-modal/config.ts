import { useTranslation } from '@affine/i18n';
import {
  DeleteTemporarilyIcon,
  FavoriteIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import type { FC, SVGProps } from 'react';
import { useMemo } from 'react';

import { pathGenerator } from '../../../shared';
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
        href: pathGenerator.all(workspaceId),
        icon: FolderIcon,
      },
      {
        title: t('Favorites'),
        href: pathGenerator.favorite(workspaceId),
        icon: FavoriteIcon,
      },
      {
        title: t('Workspace Settings'),
        href: pathGenerator.setting(workspaceId),
        icon: SettingsIcon,
      },
      {
        title: t('Trash'),
        href: pathGenerator.trash(workspaceId),
        icon: DeleteTemporarilyIcon,
      },
    ],
    [workspaceId, t]
  );
};
