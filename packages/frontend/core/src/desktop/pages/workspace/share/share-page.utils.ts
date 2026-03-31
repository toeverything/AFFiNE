import { PublicDocMode } from '@affine/graphql';
import { type DocMode, DocModes } from '@blocksuite/affine/model';

export const getResolvedPublishMode = (
  queryMode: DocMode | null,
  publicMode?: PublicDocMode | null
): DocMode => {
  if (queryMode && DocModes.includes(queryMode)) {
    return queryMode;
  }

  return publicMode === PublicDocMode.Edgeless ? 'edgeless' : 'page';
};

export const getSearchWithMode = (search: string, mode: DocMode) => {
  const searchParams = new URLSearchParams(search);
  searchParams.set('mode', mode);

  const nextSearch = searchParams.toString();
  return nextSearch ? `?${nextSearch}` : '';
};
