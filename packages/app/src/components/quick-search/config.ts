import { FC, SVGProps } from 'react';
import {
  AllPagesIcon,
  FavouritesIcon,
  TrashIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import { useTranslation } from '@affine/i18n';

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
      icon: AllPagesIcon,
    },
    {
      title: t('Favourites'),
      href: currentWorkspaceId
        ? `/workspace/${currentWorkspaceId}/favorite`
        : '',
      icon: FavouritesIcon,
    },
    {
      title: t('Settings'),
      href: currentWorkspaceId
        ? `/workspace/${currentWorkspaceId}/setting`
        : '',
      icon: SettingsIcon,
    },
    {
      title: t('Trash'),
      href: currentWorkspaceId ? `/workspace/${currentWorkspaceId}/trash` : '',
      icon: TrashIcon,
    },
  ];
};
