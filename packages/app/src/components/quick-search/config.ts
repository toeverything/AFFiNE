import { AllPagesIcon, FavouritesIcon, TrashIcon } from '@blocksuite/icons';

export const config = (currentWorkspaceId: string) => {
  const List = [
    {
      title: 'All pages',
      href: `/workspace/${
        currentWorkspaceId ? currentWorkspaceId : 'undefined'
      }/all`,
      icon: AllPagesIcon,
    },
    {
      title: 'Favourites',
      href: `/workspace/${
        currentWorkspaceId ? currentWorkspaceId : 'undefined'
      }/favorite`,
      icon: FavouritesIcon,
    },
    {
      title: 'Trash',
      href: `/workspace/${
        currentWorkspaceId ? currentWorkspaceId : 'undefined'
      }/trash`,
      icon: TrashIcon,
    },
  ];
  return List;
};
