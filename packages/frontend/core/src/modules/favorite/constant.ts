export const FavoriteSupportType = [
  'collection',
  'doc',
  'tag',
  'folder',
] as const;
export type FavoriteSupportType = 'collection' | 'doc' | 'tag' | 'folder';
export const isFavoriteSupportType = (
  type: string
): type is FavoriteSupportType =>
  FavoriteSupportType.includes(type as FavoriteSupportType);
