import { AllPagesIcon, FavouritesIcon, TrashIcon } from '@blocksuite/icons';

export const config = (currentWorkspaceId: string) => {
  const List = [
    {
      title: 'All pages',
      href: currentWorkspaceId ? `/workspace/${currentWorkspaceId}/all` : '',
      icon: AllPagesIcon,
    },
    {
      title: 'Favourites',
      href: currentWorkspaceId
        ? `/workspace/${currentWorkspaceId}/favorite`
        : '',
      icon: FavouritesIcon,
    },
    {
      title: 'Trash',
      href: currentWorkspaceId ? `/workspace/${currentWorkspaceId}/trash` : '',
      icon: TrashIcon,
    },
  ];
  return List;
};
