import type {
  AuthService,
  PublicUserService,
} from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import {
  type AffineUserInfo,
  UserServiceExtension,
} from '@blocksuite/affine/shared/services';

export function patchUserExtensions(
  publicUserService: PublicUserService,
  authService: AuthService
) {
  return UserServiceExtension({
    currentUserInfo$: authService.session.account$.map(account => {
      if (!account) {
        return null;
      }
      return {
        id: account.id,
        name: account.label,
        avatar: account.avatar,
        removed: false,
      } as AffineUserInfo;
    }).signal,
    userInfo$(id) {
      return publicUserService.publicUser$(id).signal;
    },
    isLoading$(id) {
      return publicUserService.isLoading$(id).signal;
    },
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
