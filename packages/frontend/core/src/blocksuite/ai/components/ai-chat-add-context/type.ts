import type {
  SearchCollectionMenuAction,
  SearchDocMenuAction,
  SearchTagMenuAction,
} from '@affine/core/modules/search-menu/services';
import type { LinkedMenuGroup } from '@blocksuite/affine/widgets/linked-doc';

export interface SearchMenuConfig {
  getDocMenuGroup: (
    query: string,
    action: SearchDocMenuAction,
    abortSignal: AbortSignal
  ) => LinkedMenuGroup;
  getTagMenuGroup: (
    query: string,
    action: SearchTagMenuAction,
    abortSignal: AbortSignal
  ) => LinkedMenuGroup;
  getCollectionMenuGroup: (
    query: string,
    action: SearchCollectionMenuAction,
    abortSignal: AbortSignal
  ) => LinkedMenuGroup;
}
