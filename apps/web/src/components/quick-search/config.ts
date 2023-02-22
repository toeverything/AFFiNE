import { useTranslation } from '@affine/i18n';
import {
  DeleteTemporarilyIcon,
  FavoriteIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import { FC, SVGProps } from 'react';

export const useSwitchToConfig = (
  currentWorkspaceId?: string
): {
  title: string;
  href: string;
  icon: FC<SVGProps<SVGSVGElement>>;
}[] => {
  const { t } = useTranslation();
  return [
    {
      title: t('All pages'),
      href: currentWorkspaceId ? `/workspace/${currentWorkspaceId}/all` : '',
      icon: FolderIcon,
    },
    {
      title: t('Favorites'),
      href: currentWorkspaceId
        ? `/workspace/${currentWorkspaceId}/favorite`
        : '',
      icon: FavoriteIcon,
    },
    {
      title: t('Workspace Settings'),
      href: currentWorkspaceId
        ? `/workspace/${currentWorkspaceId}/setting`
        : '',
      icon: SettingsIcon,
    },
    {
      title: t('Trash'),
      href: currentWorkspaceId ? `/workspace/${currentWorkspaceId}/trash` : '',
      icon: DeleteTemporarilyIcon,
    },
  ];
};
