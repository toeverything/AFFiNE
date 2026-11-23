import type { UserService } from '@blocksuite/affine-shared/services';
import { useEffect } from 'react';

import { useSignalValue } from '../../../modules/doc-info/utils';

export const useMemberInfo = (
  id: string,
  userService: UserService | null | undefined
) => {
  useEffect(() => {
    userService?.revalidateUserInfo(id);
  }, [id, userService]);
  return useSignalValue(userService?.userInfo$(id));
};
