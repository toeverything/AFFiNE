import { AllPagesIcon, FavouritesIcon, TrashIcon } from '@blocksuite/icons';

export const config = (currentWorkspaceId: string) => {
  const List = [
    {
      title: 'All pages',
      href: `/workspace/${currentWorkspaceId ? currentWorkspaceId : 'all'}/all`,
      icon: AllPagesIcon,
    },
    {
      title: 'Favourites',
      href: `/workspace/${
        currentWorkspaceId ? currentWorkspaceId : 'all'
      }/favorite`,
      icon: FavouritesIcon,
    },
    {
      title: 'Trash',
      href: `/workspace/${
        currentWorkspaceId ? currentWorkspaceId : 'all'
      }/trash`,
      icon: TrashIcon,
    },
  ];
  return List;
};
