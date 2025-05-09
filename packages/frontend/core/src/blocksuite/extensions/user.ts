import type { PublicUserService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { UserServiceExtension } from '@blocksuite/affine/shared/services';

export function patchUserExtensions(publicUserService: PublicUserService) {
  return UserServiceExtension({
    // eslint-disable-next-line rxjs/finnish
    userInfo$(id) {
      return publicUserService.publicUser$(id).signal;
    },
    // eslint-disable-next-line rxjs/finnish
    isLoading$(id) {
      return publicUserService.isLoading$(id).signal;
    },
    // eslint-disable-next-line rxjs/finnish
    error$(id) {
      return publicUserService.error$(id).selector(error => {
        if (error) {
          return UserFriendlyError.fromAny(error).name;
        } else {
          return null;
        }
      }).signal;
    },
    revalidateUserInfo(id) {
      publicUserService.revalidate(id);
    },
  });
}
