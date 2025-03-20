import type { MemberSearchService } from '@affine/core/modules/permissions';
import { UserListServiceExtension } from '@blocksuite/affine/shared/services';

export function patchUserListExtensions(memberSearch: MemberSearchService) {
  return UserListServiceExtension({
    // eslint-disable-next-line rxjs/finnish
    hasMore$: memberSearch.hasMore$.signal,
    loadMore() {
      memberSearch.loadMore();
    },
    // eslint-disable-next-line rxjs/finnish
    isLoading$: memberSearch.isLoading$.signal,
    // eslint-disable-next-line rxjs/finnish
    searchText$: memberSearch.searchText$.signal,
    search(keyword) {
      memberSearch.search(keyword);
    },
    // eslint-disable-next-line rxjs/finnish
    users$: memberSearch.result$.map(users =>
      users.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatarUrl,
      }))
    ).signal,
  });
}
