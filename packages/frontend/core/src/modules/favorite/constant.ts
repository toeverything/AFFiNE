export const FavoriteSupportType = ['collection', 'doc', 'tag'] as const;
export type FavoriteSupportType = 'collection' | 'doc' | 'tag';
export const isFavoriteSupportType = (
  type: string
): type is FavoriteSupportType =>
  FavoriteSupportType.includes(type as FavoriteSupportType);
