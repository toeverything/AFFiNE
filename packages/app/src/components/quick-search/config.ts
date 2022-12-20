import { AllPagesIcon, FavouritesIcon, TrashIcon } from '@blocksuite/icons';

export const config = (currentWorkspaceId: string) => {
  const List = [
    {
      title: 'All pages',
      href: `/workspace/${currentWorkspaceId}/all`,
      icon: AllPagesIcon,
    },
    {
      title: 'Favourites',
      href: `/workspace/${currentWorkspaceId}/favorite`,
      icon: FavouritesIcon,
    },
    {
      title: 'Trash',
      href: `/workspace/${currentWorkspaceId}/trash`,
      icon: TrashIcon,
    },
  ];
  return List;
};
