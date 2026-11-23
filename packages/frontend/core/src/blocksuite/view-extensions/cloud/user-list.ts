import type { MemberSearchService } from '@affine/core/modules/permissions';
import { UserListServiceExtension } from '@blocksuite/affine/shared/services';

export function patchUserListExtensions(memberSearch: MemberSearchService) {
  return UserListServiceExtension({
    hasMore$: memberSearch.hasMore$.signal,
    loadMore() {
      memberSearch.loadMore();
    },
    isLoading$: memberSearch.isLoading$.signal,
    searchText$: memberSearch.searchText$.signal,
    search(keyword) {
      memberSearch.search(keyword);
    },
    users$: memberSearch.result$.map(users =>
      users.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatarUrl,
      }))
    ).signal,
  });
}
